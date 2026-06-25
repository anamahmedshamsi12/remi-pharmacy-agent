"""Sentence embedding generation for Narrative Drift."""

from __future__ import annotations

from typing import Iterable

import numpy as np
from sentence_transformers import SentenceTransformer


DEFAULT_MODEL = "all-MiniLM-L6-v2"


def embed_texts(texts: Iterable[str], model_name: str = DEFAULT_MODEL) -> np.ndarray:
    model = SentenceTransformer(model_name)
    embeddings = model.encode(list(texts), show_progress_bar=True)
    return np.asarray(embeddings)