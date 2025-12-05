#!/usr/bin/env python
"""
Fine-tune a small language model to predict email_type from text.

- Uses processed/emails_train.csv and processed/emails_val.csv
- Column names: text, email_type
- Very easy to swap model via MODEL_NAME at the top
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


# ============================================================
# ---------------------- CONFIG ------------------------------
# ============================================================

TRAIN_PATH = "processed/emails_train.csv"
VAL_PATH = "processed/emails_val.csv"

# Small, fast models – pick one:
MODEL_NAME = "prajjwal1/bert-tiny"
# MODEL_NAME = "distilbert-base-uncased"
# MODEL_NAME = "roberta-base"

OUTPUT_DIR = "models/email_classifier_bert_tiny"
# OUTPUT_DIR = "models/email_classifier_distilbert"
# OUTPUT_DIR = "models/email_classifier_roberta"

MAX_LENGTH = 256
BATCH_SIZE = 16
NUM_EPOCHS = 10
LEARNING_RATE = 5e-5
RANDOM_SEED = 42

# ============================================================


def load_data(train_path, val_path):
    train_df = pd.read_csv(train_path)
    val_df = pd.read_csv(val_path)

    # Expecting 'text' and 'email_type' columns
    assert "text" in train_df.columns and "email_type" in train_df.columns
    assert "text" in val_df.columns and "email_type" in val_df.columns

    return train_df, val_df


def build_label_mapping(train_df, val_df):
    # Use labels from both splits, just in case
    labels = sorted(set(train_df["email_type"].unique()) |
                    set(val_df["email_type"].unique()))
    label2id = {label: i for i, label in enumerate(labels)}
    id2label = {i: label for label, i in label2id.items()}
    return label2id, id2label


def df_to_dataset(df, label2id):
    # Map labels to ids
    df = df.copy()
    df["label"] = df["email_type"].map(label2id)
    # Hugging Face Dataset
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

    # Set format for PyTorch
    train_ds = train_ds.remove_columns(["text"])
    val_ds = val_ds.remove_columns(["text"])
    train_ds.set_format(type="torch")
    val_ds.set_format(type="torch")

    return train_ds, val_ds


def compute_accuracy(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    acc = (preds == labels).mean().item()
    return {"accuracy": acc}


def main():
    torch.manual_seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Loading data...")
    train_df, val_df = load_data(TRAIN_PATH, VAL_PATH)

    print("Building label mappings...")
    label2id, id2label = build_label_mapping(train_df, val_df)
    num_labels = len(label2id)
    print(f"Number of labels: {num_labels}")
    print("Labels:", label2id)

    print("Converting to datasets...")
    train_ds = df_to_dataset(train_df, label2id)
    val_ds = df_to_dataset(val_df, label2id)

    print(f"Loading tokenizer and model: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=num_labels,
        label2id=label2id,
        id2label=id2label,
    )

    print("Tokenizing datasets...")
    train_ds, val_ds = tokenize_datasets(tokenizer, train_ds, val_ds, MAX_LENGTH)

    print("Setting up Trainer...")

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


    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        compute_metrics=compute_accuracy,
    )

    print("Starting training...")
    trainer.train()

    print("Evaluating on validation set...")
    eval_results = trainer.evaluate()
    print(f"Validation results: {eval_results}")

    print("Saving final model...")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

    print("Done.")


if __name__ == "__main__":
    main()
