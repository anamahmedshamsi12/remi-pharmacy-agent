"""Data loading and cleaning utilities for Narrative Drift."""

from __future__ import annotations

import re
from typing import Iterable

import pandas as pd

URL_PATTERN = re.compile(r"https?://\S+|www\.\S+")
WHITESPACE_PATTERN = re.compile(r"\s+")


REQUIRED_COLUMNS = {"post_id", "user", "timestamp", "text"}


def _clean_text(value: str) -> str:
    if not isinstance(value, str):
        return ""
    value = URL_PATTERN.sub("", value)
    value = WHITESPACE_PATTERN.sub(" ", value)
    return value.strip()


def clean_text_series(series: Iterable[str]) -> pd.Series:
    return pd.Series((_clean_text(text) for text in series))


def load_posts(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    df = df.copy()
    df["text_clean"] = clean_text_series(df["text"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    return df