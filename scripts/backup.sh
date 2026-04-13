#!/bin/bash
cd /opt/rehabyou
docker compose exec -T db pg_dump -U rehabyou rehabyou > backup_$(date +%Y%m%d_%H%M%S).sql
echo "Backup saved"
