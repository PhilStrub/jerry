"""
Fine-tune a small language model to predict email_type from text.

- Uses processed/emails_train.csv and processed/emails_val.csv
- Column names: text, email_type
- Easy to swap models via MODEL_NAME at the top
- Uses class-weighted loss to handle class imbalance
"""

import os
import pandas as pd
import numpy as np

from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    Trainer,
    TrainingArguments,
)
import torch
import torch.nn as nn


# ============================================================
# ---------------------- CONFIG ------------------------------
# ============================================================

TRAIN_PATH = "processed/emails_train.csv"
VAL_PATH = "processed/emails_val.csv"

# Small, fast models – pick one:
# MODEL_NAME = "prajjwal1/bert-tiny"
# MODEL_NAME = "distilbert-base-uncased"
MODEL_NAME = "roberta-base"

# pick one:
# OUTPUT_DIR = "models/weighted_email_classifier_distilbert"
# OUTPUT_DIR = "models/weighted_email_classifier_bert_tiny"
OUTPUT_DIR = "models/weighted_email_classifier_roberta"

MAX_LENGTH = 256
BATCH_SIZE = 16
NUM_EPOCHS = 3        
LEARNING_RATE = 5e-5   
RANDOM_SEED = 42

# ============================================================

import os
import pandas as pd
import numpy as np

from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    Trainer,
    TrainingArguments,
)
import torch
import torch.nn as nn


# ============================================================
# ---------------------- HELPERS ------------------------------
# ============================================================


def load_data(train_path, val_path):
    train_df = pd.read_csv(train_path)
    val_df = pd.read_csv(val_path)

    assert "text" in train_df.columns and "email_type" in train_df.columns
    assert "text" in val_df.columns and "email_type" in val_df.columns

    return train_df, val_df


def build_label_mapping(train_df, val_df):
    labels = sorted(set(train_df["email_type"].unique()) |
                    set(val_df["email_type"].unique()))
    label2id = {label: i for i, label in enumerate(labels)}
    id2label = {i: label for label, i in label2id.items()}
    return label2id, id2label


def df_to_dataset(df, label2id):
    df = df.copy()
    df["label"] = df["email_type"].map(label2id)
    return Dataset.from_pandas(df[["text", "label"]])


def tokenize_datasets(tokenizer, train_ds, val_ds, max_length):
    def preprocess(batch):
        return tokenizer(
            batch["text"],
            truncation=True,
            padding="max_length",
            max_length=max_length,
        )

    train_ds = train_ds.map(preprocess, batched=True)
    val_ds = val_ds.map(preprocess, batched=True)

    train_ds = train_ds.remove_columns(["text"])
    val_ds = val_ds.remove_columns(["text"])

    train_ds.set_format(type="torch")
    val_ds.set_format(type="torch")

    return train_ds, val_ds


def compute_accuracy(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    return {"accuracy": (preds == labels).mean().item()}


def compute_class_weights(train_df, label2id):
    counts = train_df["email_type"].value_counts().to_dict()
    num_labels = len(label2id)

    freqs = np.zeros(num_labels, dtype=np.float32)
    for label, idx in label2id.items():
        freqs[idx] = counts.get(label, 1)

    weights = 1.0 / freqs
    weights = weights * (num_labels / weights.sum())

    print("\nClass counts:", counts)
    print("Class weights:", weights)

    return torch.tensor(weights, dtype=torch.float32)


# ============================================================
# ------------------- CUSTOM WEIGHTED TRAINER ----------------
# ============================================================

class WeightedTrainer(Trainer):
    """
    Trainer with class-weighted cross-entropy loss.
    """

    def __init__(self, class_weights, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.class_weights = class_weights

    def compute_loss(
        self,
        model,
        inputs,
        return_outputs=False,
        num_items_in_batch=None,  # Needed for Transformers ≥ 4.44
    ):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.logits

        loss_fct = nn.CrossEntropyLoss(
            weight=self.class_weights.to(logits.device)
        )
        loss = loss_fct(
            logits.view(-1, logits.size(-1)),
            labels.view(-1),
        )

        return (loss, outputs) if return_outputs else loss


# ============================================================
# -------------------------- MAIN ----------------------------
# ============================================================

def main():

    torch.manual_seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("\nLoading data...")
    train_df, val_df = load_data(TRAIN_PATH, VAL_PATH)

    print("\nCreating label mappings...")
    label2id, id2label = build_label_mapping(train_df, val_df)
    num_labels = len(label2id)
    print("Labels:", label2id)

    print("\nComputing class weights...")
    class_weights = compute_class_weights(train_df, label2id)

    print("\nConverting to HF datasets...")
    train_ds = df_to_dataset(train_df, label2id)
    val_ds = df_to_dataset(val_df, label2id)

    print(f"\nLoading model + tokenizer: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=num_labels,
        label2id=label2id,
        id2label=id2label,
    )

    print("\nTokenizing...")
    train_ds, val_ds = tokenize_datasets(tokenizer, train_ds, val_ds, MAX_LENGTH)

    print("\nBuilding TrainingArguments...")
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        learning_rate=LEARNING_RATE,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        num_train_epochs=NUM_EPOCHS,
        weight_decay=0.01,
        logging_steps=50,
        seed=RANDOM_SEED,
    )

    print("\nStarting weighted training...")
    trainer = WeightedTrainer(
        class_weights=class_weights,
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        compute_metrics=compute_accuracy,
    )

    trainer.train()

    print("\nEvaluating final model...")
    eval_results = trainer.evaluate()
    print("Evaluation:", eval_results)

    print("\nSaving model...")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

    print("\nDone.\n")


# ============================================================

if __name__ == "__main__":
    main()
