import knime.scripting.io as knio
import pandas as pd
import numpy as np
import torch

from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    Trainer,
    TrainingArguments,
)


# ============================================================
# ---------------------- CONFIG ------------------------------
# ============================================================

MODEL_NAME = "prajjwal1/bert-tiny"   # lightweight model for workflow
MAX_LENGTH = 256
BATCH_SIZE = 16
NUM_EPOCHS = 3
LEARNING_RATE = 5e-4
RANDOM_SEED = 42

# ============================================================


def set_seeds(seed: int = RANDOM_SEED):
    torch.manual_seed(seed)
    np.random.seed(seed)


def get_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


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


def tokenize_datasets(tokenizer, train_ds, val_ds):
    def preprocess(batch):
        return tokenizer(
            batch["text"],
            truncation=True,
            padding="max_length",
            max_length=MAX_LENGTH,
        )

    train_ds = train_ds.map(preprocess, batched=True)
    val_ds = val_ds.map(preprocess, batched=True)

    train_ds = train_ds.remove_columns(["text"])
    val_ds = val_ds.remove_columns(["text"])

    train_ds.set_format("torch")
    val_ds.set_format("torch")

    return train_ds, val_ds


def compute_accuracy(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    return {"accuracy": (preds == labels).mean().item()}


def train_and_predict(train_df, val_df):
    assert "text" in train_df and "email_type" in train_df
    assert "text" in val_df and "email_type" in val_df

    set_seeds(RANDOM_SEED)
    device = get_device()

    # ----- Label mapping -----
    label2id, id2label = build_label_mapping(train_df, val_df)

    # ----- HF datasets -----
    train_ds = df_to_dataset(train_df, label2id)
    val_ds = df_to_dataset(val_df, label2id)

    # ----- Load model & tokenizer -----
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(label2id),
        label2id=label2id,
        id2label=id2label,
    ).to(device)

    # ----- Tokenization -----
    train_ds, val_ds = tokenize_datasets(tokenizer, train_ds, val_ds)

    # ----- Trainer -----
    training_args = TrainingArguments(
        output_dir="./knime_temp",    # ignored, but required by Trainer API
        learning_rate=LEARNING_RATE,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        num_train_epochs=NUM_EPOCHS,
        weight_decay=0.01,
        logging_steps=50,
        seed=RANDOM_SEED,
        save_strategy="no",           # DON'T save any checkpoints
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        compute_metrics=compute_accuracy,
    )

    # ----- Train model -----
    trainer.train()

    # ----- Predict on validation -----
    preds = trainer.predict(val_ds).predictions
    pred_ids = np.argmax(preds, axis=-1)
    pred_labels = [id2label[int(i)] for i in pred_ids]

    # ----- Add predictions -----
    val_with_pred = val_df.copy()
    val_with_pred["Prediction()"] = pred_labels

    return val_with_pred


# ============================================================
# ----------------------- KNIME I/O --------------------------
# ============================================================

# Input table 0 → train set
# Input table 1 → validation set
train_df = knio.input_tables[0].to_pandas()
val_df   = knio.input_tables[1].to_pandas()

val_with_preds = train_and_predict(train_df, val_df)

# Output table → validation + Prediction()
knio.output_tables[0] = knio.Table.from_pandas(val_with_preds)
