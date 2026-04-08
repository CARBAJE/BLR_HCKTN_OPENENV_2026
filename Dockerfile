# ──────────────────────────────────────────────────────────────────────────────
# OpenEnv — React OS Simulator + FastAPI + DOMAgent
# Tagged: openenv
# Target: Hugging Face Spaces (Docker SDK), 2 vCPU / 8 GB RAM
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

# HF Spaces metadata
LABEL org.opencontainers.image.title="OpenEnv React-OS"
LABEL org.opencontainers.image.description="OpenEnv-compatible RL environment wrapping a React/Vite OS simulator."
LABEL space.tag="openenv"

# --------------------------------------------------------------------------
# System dependencies
# --------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      gnupg \
      socat \
      ca-certificates \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

# Node 20 via NodeSource (for Vite/OSaaS)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# --------------------------------------------------------------------------
# Working directory
# --------------------------------------------------------------------------
WORKDIR /app

# --------------------------------------------------------------------------
# Python dependencies (CPU-only torch to fit 8 GB RAM constraint)
# --------------------------------------------------------------------------
COPY requirements.txt .
RUN pip install --no-cache-dir \
      "numpy<2" \
      torch==2.4.0+cpu \
      torchvision==0.19.0+cpu \
      torchaudio==2.4.0+cpu \
      --extra-index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

# --------------------------------------------------------------------------
# Node dependencies (OSaaS frontend)
# --------------------------------------------------------------------------
COPY OSaaS/package.json OSaaS/package-lock.json ./OSaaS/
RUN cd OSaaS && npm ci

# --------------------------------------------------------------------------
# Copy application code
# --------------------------------------------------------------------------
COPY . .

# --------------------------------------------------------------------------
# Permissions & entry point
# --------------------------------------------------------------------------
RUN chmod +x /app/start.sh

# HF Spaces requires the app to bind on port 7860.
# socat inside start.sh forwards 7860 → FastAPI on 8000.
EXPOSE 7860

# --------------------------------------------------------------------------
# Environment variables (override in HF Space secrets/settings)
# --------------------------------------------------------------------------
ENV VITE_BASE_URL=http://localhost:5173 \
    API_BASE_URL=http://localhost:5173 \
    HF_TOKEN="" \
    PYTHONUNBUFFERED=1 \
    # Prevent sentence-transformers from downloading at runtime
    SENTENCE_TRANSFORMERS_HOME=/app/.cache/st \
    TORCH_HOME=/app/.cache/torch

# NOTE: sentence-transformers model (all-MiniLM-L6-v2) will be downloaded
# on first use. Set HF_HUB_OFFLINE=1 to disable downloads at runtime.

# --------------------------------------------------------------------------
# Launch
# --------------------------------------------------------------------------
CMD ["/app/start.sh"]
