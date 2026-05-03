#!/bin/bash

set -euo pipefail

echo "Installing required packages..."
sudo apt-get update
sudo apt-get install -y gnupg curl

echo "Adding MongoDB 8.0 GPG key..."
curl -fsSL https://pgp.mongodb.com/server-8.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg \
  --dearmor

echo "Adding MongoDB 8.0 repository for Ubuntu 22.04 Jammy..."
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/8.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list

echo "Updating package index..."
sudo apt-get update

echo "Installing MongoDB..."
sudo apt-get install -y mongodb-org

echo "Reloading systemd..."
sudo systemctl daemon-reload

echo "Starting MongoDB..."
sudo systemctl start mongod

echo "Enabling MongoDB to start on boot..."
sudo systemctl enable mongod

echo "MongoDB service status:"
sudo systemctl status mongod --no-pager
