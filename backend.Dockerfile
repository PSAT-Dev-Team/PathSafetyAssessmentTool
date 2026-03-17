FROM python:3.11-slim

# System dependencies required by geopandas / opencv / fiona
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
# pywin32 is Windows-only; strip it before installing on Linux
RUN grep -v 'pywin32' requirements.txt > requirements-linux.txt && \
    pip install --no-cache-dir -r requirements-linux.txt

COPY backend /app

EXPOSE 8000
CMD ["python", "app.py"]
