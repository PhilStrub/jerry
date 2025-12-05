#!/usr/bin/env python
"""
Evaluate the fine-tuned email classifier on the validation set.

- Loads the saved model & tokenizer from `MODEL_DIR`
- Uses `processed/emails_val.csv`
- Prints accuracy & classification report
- Saves a confusion matrix heatmap as PNG
"""

import os
import numpy as np
import pandas as pd
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from sklearn.metrics import confusion_matrix, classification_report, accuracy_score
import matplotlib.pyplot as plt


# ============================================================
# ---------------------- CONFIG ------------------------------
# ============================================================

VAL_PATH = "processed/type_val.csv"
MODEL_DIR = "bin/type_classifier_bert_tiny"
MAX_LENGTH = 256
BATCH_SIZE = 32

CONF_MAT_FIG_PATH = os.path.join(MODEL_DIR, "confusion_matrix.png")

# ============================================================


def get_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def load_model_and_tokenizer():
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    return tokenizer, model


def load_data(val_path):
    df = pd.read_csv(val_path)
    assert "text" in df.columns and "email_type" in df.columns
    return df


def get_label_mappings(model):
    config = model.config
    # config.label2id keys might be strings (label names) or ids as strings
    label2id = config.label2id
    id2label = config.id2label

    # Ensure sorted by integer id order 0..N-1
    num_labels = len(label2id)
    id_to_name = []
    for i in range(num_labels):
        # keys may be str(i) or int(i)
        if isinstance(id2label, dict):
            if i in id2label:
                id_to_name.append(id2label[i])
            else:
                id_to_name.append(id2label[str(i)])
        else:
            # Fallback (shouldn't happen with HF models)
            id_to_name.append(str(i))

    return label2id, id_to_name


def encode_batch(tokenizer, texts, max_length, device):
    enc = tokenizer(
        texts,
        truncation=True,
        padding=True,
        max_length=max_length,
        return_tensors="pt",
    )
    return {k: v.to(device) for k, v in enc.items()}


def main():
    device = get_device()
    print(f"Using device: {device}")

    print("Loading model and tokenizer...")
    tokenizer, model = load_model_and_tokenizer()
    model.to(device)
    model.eval()

    print("Loading validation data...")
    df_val = load_data(VAL_PATH)

    print("Building label mappings from model config...")
    label2id, id_to_name = get_label_mappings(model)

    # Map text labels to numeric ids
    if isinstance(label2id, dict):
        # label2id maps label_name -> id
        df_val["label"] = df_val["email_type"].map(label2id)
    else:
        raise ValueError("Unexpected label2id format in model config")

    y_true = df_val["label"].to_numpy()
    texts = df_val["text"].tolist()

    print("Running model on validation set...")
    all_preds = []

    with torch.no_grad():
        for start in range(0, len(texts), BATCH_SIZE):
            end = start + BATCH_SIZE
            batch_texts = texts[start:end]
            encoded = encode_batch(tokenizer, batch_texts, MAX_LENGTH, device)
            outputs = model(**encoded)
            logits = outputs.logits
            preds = torch.argmax(logits, dim=-1).cpu().numpy()
            all_preds.append(preds)

    y_pred = np.concatenate(all_preds)

    # ----------------- Metrics -----------------

    acc = accuracy_score(y_true, y_pred)
    print(f"\nValidation accuracy: {acc:.4f}\n")

    print("Classification report:")
    print(
        classification_report(
            y_true,
            y_pred,
            target_names=id_to_name,
            digits=4,
        )
    )

    # Confusion matrix (rows = true labels, cols = predicted labels)
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(id_to_name))))
    print("Confusion matrix (raw counts):")
    print(cm)

    # ----------------- Plot & save -----------------

    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(cm, interpolation="nearest", cmap="Blues")
    ax.figure.colorbar(im, ax=ax)

    # Tick labels
    ax.set(
        xticks=np.arange(cm.shape[1]),
        yticks=np.arange(cm.shape[0]),
        xticklabels=id_to_name,
        yticklabels=id_to_name,
        ylabel="True label",
        xlabel="Predicted label",
        title="Confusion Matrix - Validation Set",
    )

    plt.setp(ax.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")

    # Label cells with counts
    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(
                j,
                i,
                format(cm[i, j], "d"),
                ha="center",
                va="center",
                color="white" if cm[i, j] > thresh else "black",
            )

    fig.tight_layout()
    os.makedirs(MODEL_DIR, exist_ok=True)
    plt.savefig(CONF_MAT_FIG_PATH)
    plt.close(fig)

    print(f"\nSaved confusion matrix plot to: {CONF_MAT_FIG_PATH}")


if __name__ == "__main__":
    main()
