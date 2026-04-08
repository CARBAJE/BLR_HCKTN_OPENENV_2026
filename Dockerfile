# ──────────────────────────────────────────────────────────────────────────────
# OpenEnv — React OS Simulator + FastAPI wrapper
# Runs on Hugging Face Spaces (Docker SDK)
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

# --------------------------------------------------------------------------
# System dependencies
# --------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      gnupg \
      socat \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node 20 via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# --------------------------------------------------------------------------
# Working directory
# --------------------------------------------------------------------------
WORKDIR /app

# --------------------------------------------------------------------------
# Python dependencies (cached layer)
# --------------------------------------------------------------------------
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --------------------------------------------------------------------------
# Node dependencies (only if package.json exists)
# --------------------------------------------------------------------------
COPY . .
RUN if [ -f "package.json" ]; then npm ci --omit=dev; fi

# --------------------------------------------------------------------------
# Permissions & entry point
# --------------------------------------------------------------------------
RUN chmod +x /app/start.sh

# HF Spaces requires the app to bind on port 7860.
# socat inside start.sh forwards 7860 → FastAPI on 8000.
EXPOSE 7860

# --------------------------------------------------------------------------
# Environment variables (can be overridden in HF Space settings)
# --------------------------------------------------------------------------
ENV VITE_BASE_URL=http://localhost:5173 \
    API_BASE_URL=http://localhost:5173 \
    MODEL_NAME=gpt-4o \
    HF_TOKEN="" \
    PYTHONUNBUFFERED=1

# --------------------------------------------------------------------------
# Launch
# --------------------------------------------------------------------------
CMD ["/app/start.sh"]
