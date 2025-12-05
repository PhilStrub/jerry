import knime.scripting.io as knio
import pandas as pd
import numpy as np
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

"""
    Script to put inside a KNIME Python Script node to predict email types using a fine-tuned transformer model.
    Assumes the input data table has a column: text.
    Outputs a KNIME table with an additional column: Prediction().
"""


# ========= CONFIG =========
# Path to your fine-tuned model directory (change to your actual path)
# Example if you saved it under the repo folder:
# MODEL_DIR = "/Users/.../project/models/email_classifier_bert_tiny"
MODEL_DIR = "/ABSOLUTE/OR/RELATIVE/PATH/TO/YOUR/MODEL_DIR"

MAX_LENGTH = 256
BATCH_SIZE = 32
# ==========================


def get_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


# ----- 1. Read KNIME input (Arrow → pandas) -----
input_table = knio.input_tables[0]
df = input_table.to_pandas()

if "text" not in df.columns:
    raise ValueError("Input table must contain a 'text' column with email text.")

# ----- 2. Load model + tokenizer -----
device = get_device()

tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
model.to(device)
model.eval()

# Build id → label mapping robustly
config = model.config
id2label = config.id2label  # can have int or str keys

def idx_to_label(idx: int) -> str:
    if isinstance(id2label, dict):
        if idx in id2label:
            return id2label[idx]
        if str(idx) in id2label:
            return id2label[str(idx)]
    # Fallback
    return str(idx)


# ----- 3. Run predictions in batches -----
texts = df["text"].astype(str).tolist()
pred_labels = []

with torch.no_grad():
    for start in range(0, len(texts), BATCH_SIZE):
        batch_texts = texts[start:start + BATCH_SIZE]
        enc = tokenizer(
            batch_texts,
            truncation=True,
            padding=True,
            max_length=MAX_LENGTH,
            return_tensors="pt",
        )

        # Move tensors to device
        enc = {k: v.to(device) for k, v in enc.items()}

        outputs = model(**enc)
        logits = outputs.logits
        batch_pred_ids = torch.argmax(logits, dim=-1).cpu().numpy()

        batch_labels = [idx_to_label(int(i)) for i in batch_pred_ids]
        pred_labels.extend(batch_labels)

# Sanity check
if len(pred_labels) != len(df):
    raise RuntimeError("Number of predictions does not match number of rows")

# ----- 4. Attach predictions to DataFrame -----
df_out = df.copy()
df_out["Prediction()"] = pred_labels  # e.g. 'issue', 'inquiry', 'suggestion'

# ----- 5. Output to KNIME (pandas → KNIME Table) -----
output_table = knio.Table.from_pandas(df_out)
knio.output_tables[0] = output_table
