"""Regularised logistic regression and Platt calibration in numpy (issue #151).

* Optimiser: damped Newton / IRLS on the L2-penalised log-loss (intercept not penalised).
  With ~13 standardised features the Hessian is tiny, so Newton converges in a handful of
  iterations. Each step is halved until the penalised loss decreases. Convergence means the
  largest absolute gradient component is below ``tol``; ``converged`` and ``n_iter`` are
  stored on the fitted object and the caller must report them. No randomness inside the
  optimiser; the only random step is negative subsampling, which takes an explicit seed.
* Negative subsampling (``subsample_negatives``) is for TRAINING only: it keeps every positive
  and ``ratio`` negatives per positive. It shifts the intercept; Platt calibration, fitted
  on the full eligible universe of the calibration origin, corrects that shift.
* Platt calibration: ``p = sigmoid(a * decision + b)`` fitted by the same Newton routine.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


def sigmoid(z: np.ndarray) -> np.ndarray:
    return 0.5 * (1.0 + np.tanh(0.5 * z))  # stable for large |z|


def _loss(X1, y, beta, l2):
    z = X1 @ beta
    # sum log(1 + exp(z)) - y z, computed stably
    return float(np.sum(np.logaddexp(0.0, z) - y * z) + 0.5 * l2 * np.sum(beta[1:] ** 2))


def newton_logistic(X, y, l2: float, max_iter: int = 100, tol: float = 1e-8):
    """Fit logistic regression by damped Newton. Returns ``(beta, converged, n_iter)``.

    ``beta[0]`` is the intercept. ``l2`` penalises the other coefficients (sum-loss scale).
    """
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    X1 = np.column_stack([np.ones(len(X)), X])
    pen = np.full(X1.shape[1], l2)
    pen[0] = 0.0
    beta = np.zeros(X1.shape[1])
    loss = _loss(X1, y, beta, l2)
    for it in range(1, max_iter + 1):
        p = sigmoid(X1 @ beta)
        grad = X1.T @ (p - y) + pen * beta
        if np.max(np.abs(grad)) < tol:
            return beta, True, it - 1
        w = np.maximum(p * (1 - p), 1e-12)
        hess = (X1 * w[:, None]).T @ X1 + np.diag(pen) + 1e-10 * np.eye(len(beta))
        step = np.linalg.solve(hess, grad)
        t = 1.0
        while t > 1e-10:
            new = _loss(X1, y, beta - t * step, l2)
            if new <= loss:
                break
            t *= 0.5
        else:
            return beta, False, it
        beta, loss = beta - t * step, new
    p = sigmoid(X1 @ beta)
    grad = X1.T @ (p - y) + pen * beta
    return beta, bool(np.max(np.abs(grad)) < tol), max_iter


def subsample_negatives(y: np.ndarray, ratio: int = 10, seed: int = 0) -> np.ndarray:
    """Sorted row indices: all positives plus up to ``ratio`` random negatives per positive."""
    y = np.asarray(y).astype(bool)
    pos = np.flatnonzero(y)
    neg = np.flatnonzero(~y)
    keep = min(len(neg), ratio * len(pos))
    chosen = np.random.default_rng(seed).choice(neg, size=keep, replace=False)
    return np.sort(np.concatenate([pos, chosen]))


@dataclass
class LogisticModel:
    """Standardise features with training mean/std, then logistic regression."""

    l2: float = 1.0
    coef: np.ndarray | None = None
    intercept: float = 0.0
    mean: np.ndarray | None = None
    scale: np.ndarray | None = None
    converged: bool = False
    n_iter: int = 0

    def fit(self, X: np.ndarray, y: np.ndarray) -> "LogisticModel":
        X = np.asarray(X, dtype=float)
        y = np.asarray(y).astype(float)
        if y.sum() == 0 or y.sum() == len(y):
            raise ValueError("training labels need both classes")
        self.mean = X.mean(axis=0)
        std = X.std(axis=0)
        self.scale = np.where(std > 0, std, 1.0)
        beta, self.converged, self.n_iter = newton_logistic((X - self.mean) / self.scale, y, self.l2)
        self.intercept, self.coef = float(beta[0]), beta[1:]
        return self

    def decision(self, X: np.ndarray) -> np.ndarray:
        """Log-odds of the training distribution (not calibrated probabilities)."""
        return ((np.asarray(X, dtype=float) - self.mean) / self.scale) @ self.coef + self.intercept


@dataclass
class Platt:
    """``p = sigmoid(a * decision + b)`` fitted on the calibration origin only."""

    a: float = 1.0
    b: float = 0.0
    converged: bool = False

    def fit(self, decision: np.ndarray, y: np.ndarray) -> "Platt":
        y = np.asarray(y).astype(float)
        if y.sum() == 0 or y.sum() == len(y):
            raise ValueError("calibration labels need both classes")
        beta, self.converged, _ = newton_logistic(np.asarray(decision, float)[:, None], y, l2=1e-6)
        self.b, self.a = float(beta[0]), float(beta[1])
        return self

    def predict(self, decision: np.ndarray) -> np.ndarray:
        return sigmoid(self.a * np.asarray(decision, float) + self.b)
