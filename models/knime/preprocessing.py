import knime.scripting.io as knio
import pandas as pd
import numpy as np
import ast
from sklearn.model_selection import train_test_split

"""
    Script to put inside a KNIME Python Script node to preprocess email data.
    Assumes the input data table has columns: subject, message_body, email_types.
    Outputs two KNIME tables: training and validation splits.
"""

# ========= CONFIG =========
VAL_SIZE = 0.2       # 20% validation
RANDOM_SEED = 42
# ==========================

# ----- 1. Read KNIME input (Arrow → pandas) -----
# input_tables[0] is an ArrowSourceTable, so convert it:
input_table = knio.input_tables[0]
df = input_table.to_pandas()

# Expect columns: subject, message_body, email_types
required_cols = ["subject", "message_body", "email_types"]
missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise ValueError(f"Missing required columns in input table: {missing}")


# ----- 2. Helper functions -----

def clean_label(raw_label):
    """Normalize email_types into a simple lowercase string."""
    if pd.isna(raw_label):
        return np.nan

    s = str(raw_label).strip()

    # Handle list-like strings such as "['issue']"
    try:
        parsed = ast.literal_eval(s)
        if isinstance(parsed, list) and len(parsed) > 0:
            s = parsed[0]
    except Exception:
        pass

    s = str(s).strip().lower()
    return s if s else np.nan


def combine_subject_and_body(subject, body):
    subject = "" if pd.isna(subject) else str(subject).strip()
    body = "" if pd.isna(body) else str(body).strip()

    if subject and body:
        return f"Subject: {subject}\n\n{body}"
    elif subject:
        return f"Subject: {subject}"
    else:
        return body


# ----- 3. Preprocessing -----

# Clean label
df["email_type"] = df["email_types"].apply(clean_label)
df = df.dropna(subset=["email_type"])

# Build text column
df["text"] = df.apply(
    lambda row: combine_subject_and_body(row["subject"], row["message_body"]),
    axis=1,
)

# Drop empty texts
df["text"] = df["text"].str.strip()
df = df[df["text"] != ""].reset_index(drop=True)

# ----- 4. Stratified train/validation split -----

train_df, val_df = train_test_split(
    df,
    test_size=VAL_SIZE,
    random_state=RANDOM_SEED,
    stratify=df["email_type"],
)

train_df = train_df.reset_index(drop=True)
val_df   = val_df.reset_index(drop=True)

# ----- 5. Output to KNIME (pandas → KNIME Table) -----

train_table = knio.Table.from_pandas(train_df)
val_table   = knio.Table.from_pandas(val_df)

knio.output_tables[0] = train_table   # first output port
knio.output_tables[1] = val_table     # second output port
