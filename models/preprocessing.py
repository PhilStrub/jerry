#!/usr/bin/env python
"""
Simple preprocessing script for email classification.

Steps:
- Load it_customers.csv
- Clean label column (email_types -> email_type)
- Drop underrepresented classes
- Combine subject + message_body into a single text column
- Split into train/validation sets
- Save processed CSVs

Configuration is at the top of the file.
"""

import ast
import os
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split


# ============================================================
# ---------------------- CONFIG ------------------------------
# ============================================================

INPUT_PATH = "data/it_customers.csv"
OUTPUT_DIR = "./processed"
MIN_SAMPLES_PER_CLASS = 20
VAL_SIZE = 0.2
RANDOM_SEED = 42

# ============================================================


def clean_label(raw_label):
    """Convert values like "['issue']" into 'issue', normalize, and handle edge cases."""
    if pd.isna(raw_label):
        return np.nan

    s = str(raw_label).strip()

    # Try to parse list-like strings
    try:
        parsed = ast.literal_eval(s)
        if isinstance(parsed, list) and len(parsed) > 0:
            s = str(parsed[0])
        elif isinstance(parsed, str):
            s = parsed
    except Exception:
        pass

    s = s.strip().lower()
    return s if s else np.nan


def combine_subject_and_body(subject, body):
    """Combine subject and message_body into a single text field."""
    subject = "" if pd.isna(subject) else str(subject).strip()
    body = "" if pd.isna(body) else str(body).strip()

    if subject and body:
        return f"Subject: {subject}\n\n{body}"
    elif subject:
        return f"Subject: {subject}"
    else:
        return body


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Loading data from: {INPUT_PATH}")
    df = pd.read_csv(INPUT_PATH)

    # Keep useful columns
    df = df[["subject", "message_body", "email_types"]].copy()

    # Clean labels
    print("Cleaning labels...")
    df["email_type"] = df["email_types"].apply(clean_label)
    df = df.dropna(subset=["email_type"])

    # Combine text fields
    print("Combining subject and body...")
    df["text"] = df.apply(
        lambda row: combine_subject_and_body(row["subject"], row["message_body"]), axis=1
    )
    df = df[df["text"].str.strip() != ""]

    # Drop underrepresented classes
    print("Filtering underrepresented classes...")
    label_counts = df["email_type"].value_counts()
    print("Label distribution BEFORE:")
    print(label_counts)

    keep_labels = label_counts[label_counts >= MIN_SAMPLES_PER_CLASS].index
    df = df[df["email_type"].isin(keep_labels)].copy()

    print(f"Keeping labels with >= {MIN_SAMPLES_PER_CLASS} samples:")
    print(df["email_type"].value_counts())

    # Final dataset for modeling
    df_model = df[["text", "email_type"]].reset_index(drop=True)

    # Split
    print("Splitting into train/val sets...")
    train_df, val_df = train_test_split(
        df_model,
        test_size=VAL_SIZE,
        stratify=df_model["email_type"],
        random_state=RANDOM_SEED,
    )

    print(f"Train size: {len(train_df)}, Val size: {len(val_df)}")

    # Save
    train_path = os.path.join(OUTPUT_DIR, "emails_train.csv")
    val_path = os.path.join(OUTPUT_DIR, "emails_val.csv")
    full_path = os.path.join(OUTPUT_DIR, "emails_preprocessed_full.csv")

    train_df.to_csv(train_path, index=False)
    val_df.to_csv(val_path, index=False)
    df_model.to_csv(full_path, index=False)

    print(f"Saved train set → {train_path}")
    print(f"Saved val set   → {val_path}")
    print(f"Saved full data → {full_path}")
    print("Done.")


if __name__ == "__main__":
    main()
