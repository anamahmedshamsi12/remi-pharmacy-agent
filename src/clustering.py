"""Clustering utilities for Narrative Drift."""

from __future__ import annotations

from typing import Tuple

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import normalize


DEFAULT_N_CLUSTERS = 8


def cluster_embeddings(
    embeddings: np.ndarray,
    n_clusters: int = DEFAULT_N_CLUSTERS,
    random_state: int = 42,
) -> Tuple[np.ndarray, KMeans]:
    if embeddings.size == 0:
        raise ValueError("Embeddings array is empty.")

    normalized = normalize(embeddings)
    model = KMeans(n_clusters=n_clusters, random_state=random_state, n_init="auto")
    labels = model.fit_predict(normalized)
    return labels, model