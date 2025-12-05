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

"""
Train a lightweight BERT model to predict email_type from text,
and return the validation DataFrame with a Prediction() column.

Expects train_df and val_df with at least: ["text", "email_type"]
"""

# ============================================================
# ---------------------- CONFIG ------------------------------
# ============================================================

LABEL_COL = "email_type"              # target: issue / inquiry / suggestion

MODEL_NAME = "prajjwal1/bert-tiny"

# you can also choose larger, more accurate models (but longer training time!):
# MODEL_NAME = "prajjwal1/bert-mini"
# MODEL_NAME = "prajjwal1/bert-small"
# MODEL_NAME = "prajjwal1/bert-medium"

MAX_LENGTH = 256
BATCH_SIZE = 16
NUM_EPOCHS = 8
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


def build_label_mapping(train_df: pd.DataFrame, val_df: pd.DataFrame, label_col: str):
    labels = sorted(set(train_df[label_col].unique()) |
                    set(val_df[label_col].unique()))
    label2id = {label: i for i, label in enumerate(labels)}
    id2label = {i: label for label, i in label2id.items()}
    return label2id, id2label


def df_to_dataset(df: pd.DataFrame, label2id: dict, label_col: str) -> Dataset:
    df = df.copy()
    df["label"] = df[label_col].map(label2id)
    return Dataset.from_pandas(df[["text", "label"]])


def tokenize_datasets(tokenizer, train_ds: Dataset, val_ds: Dataset):
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


def train_and_predict_type(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    label_col: str = LABEL_COL,
    model_name: str = MODEL_NAME,
) -> pd.DataFrame:
    # Sanity checks on columns
    required = {"text", label_col}
    missing_train = required - set(train_df.columns)
    missing_val = required - set(val_df.columns)
    if missing_train or missing_val:
        raise ValueError(
            f"Missing required columns.\n"
            f"Train missing: {missing_train}, columns: {list(train_df.columns)}\n"
            f"Val missing:   {missing_val}, columns: {list(val_df.columns)}"
        )

    set_seeds(RANDOM_SEED)
    device = get_device()

    # ----- Label mapping -----
    label2id, id2label = build_label_mapping(train_df, val_df, label_col)
    num_labels = len(label2id)
    print(f"Label mapping for '{label_col}': {label2id}")

    # ----- HF datasets -----
    train_ds = df_to_dataset(train_df, label2id, label_col)
    val_ds = df_to_dataset(val_df, label2id, label_col)

    # ----- Load model & tokenizer -----
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        num_labels=num_labels,
        label2id=label2id,
        id2label=id2label,
    ).to(device)

    # ----- Tokenization -----
    train_ds, val_ds = tokenize_datasets(tokenizer, train_ds, val_ds)

    # ----- Trainer -----
    training_args = TrainingArguments(
        output_dir="./knime_temp_email_type",  # minimal temp dir
        learning_rate=LEARNING_RATE,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        num_train_epochs=NUM_EPOCHS,
        weight_decay=0.01,
        logging_steps=50,
        seed=RANDOM_SEED,
        save_strategy="no",  # don't save checkpoints
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
    print("Training email_type model...")
    trainer.train()

    # ----- Predict on validation -----
    print("Predicting on validation set...")
    preds = trainer.predict(val_ds).predictions
    pred_ids = np.argmax(preds, axis=-1)
    pred_labels = [id2label[int(i)] for i in pred_ids]

    if len(pred_labels) != len(val_df):
        raise RuntimeError("Number of predictions does not match number of validation rows")

    val_with_pred = val_df.copy()
    val_with_pred["Prediction()"] = pred_labels  # issue / inquiry / suggestion

    return val_with_pred


# ============================================================
# ----------------------- KNIME I/O --------------------------
# ============================================================

# Input table 0 → train set (preprocessed)
# Input table 1 → validation set (preprocessed)
train_df = knio.input_tables[0].to_pandas()
val_df = knio.input_tables[1].to_pandas()

val_with_preds = train_and_predict_type(train_df, val_df)

# Output table → validation + Prediction()
knio.output_tables[0] = knio.Table.from_pandas(val_with_preds)
