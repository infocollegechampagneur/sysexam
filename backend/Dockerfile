FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ocrmypdf tesseract-ocr-fra tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY . .
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

EXPOSE 8001
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port 8001 --workers ${WEB_CONCURRENCY:-4} --proxy-headers --forwarded-allow-ips='*'"]
