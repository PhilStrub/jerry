#!/bin/bash
#
# Script: setup-adventureworks.sh
# Purpose: Downloads and prepares AdventureWorks sample database for Postgres
# Context: One-time setup before first docker-compose up
#
# Dependencies:
#   - git: Clone AdventureWorks-for-Postgres repository
#   - curl: Download CSV files from Microsoft
#   - unzip: Extract CSV files
#   - ruby: (Optional) Process CSV files for better compatibility
#
# Usage:
#   ./setup-adventureworks.sh
#
# Example:
#   # First time setup
#   ./setup-adventureworks.sh
#   docker-compose up --build
#
# What it does:
#   1. Checks if adventureworks-data/ already exists (skips if complete)
#   2. Clones AdventureWorks-for-Postgres from GitHub
#   3. Downloads CSV files from Microsoft SQL Server samples (20MB)
#   4. Optionally processes CSVs with Ruby for better data quality
#   5. Copies install.sql and CSV files to adventureworks-data/
#   6. Cleans up temporary files
#
# Exit codes:
#   0 - Setup complete or already done
#   1 - Download or extraction failed
#
# Output:
#   Creates adventureworks-data/ directory with:
#   - install.sql (database schema and constraints)
#   - 71 CSV files (tables from AdventureWorks OLTP database)
#

set -e  # Exit on error

echo "Setting up AdventureWorks database..."

# Check if adventureworks-data directory already exists
if [ -d "adventureworks-data" ]; then
    # Check if it has CSV files
    CSV_COUNT=$(ls -1 adventureworks-data/*.csv 2>/dev/null | wc -l)
    if [ "$CSV_COUNT" -gt 50 ]; then
        echo "✓ AdventureWorks already set up ($CSV_COUNT CSV files found)"
        exit 0
    else
        echo "Directory exists but CSV files missing. Re-downloading..."
        rm -rf adventureworks-data
    fi
fi

# Create temporary directory
TEMP_DIR=$(mktemp -d)
echo "Downloading AdventureWorks-for-Postgres..."

# Clone the repository
git clone --depth 1 https://github.com/lorint/AdventureWorks-for-Postgres.git "$TEMP_DIR"

# Download CSV files from Microsoft
echo "Downloading CSV files from Microsoft (20MB)..."
cd "$TEMP_DIR"
curl -L -o adventure_works_2014_OLTP_script.zip \
    https://github.com/Microsoft/sql-server-samples/releases/download/adventureworks/AdventureWorks-oltp-install-script.zip

echo "Extracting CSV files..."
unzip -q adventure_works_2014_OLTP_script.zip

# Check if Ruby is installed (needed for CSV processing)
if command -v ruby &> /dev/null; then
    echo "Processing CSV files with Ruby..."
    ruby update_csvs.rb
else
    echo "⚠ Ruby not found. Skipping CSV processing."
    echo "  The database might have issues with some data."
    echo "  Install Ruby if you encounter problems."
fi

cd -

# Create the data directory
mkdir -p adventureworks-data

# Copy the install script and CSV files
echo "Copying database files..."
cp "$TEMP_DIR/install.sql" adventureworks-data/
cp "$TEMP_DIR"/*.csv adventureworks-data/

# Fix CSV paths in install.sql to use absolute paths
# The Postgres docker-entrypoint mounts our directory at /docker-entrypoint-initdb.d/
# but doesn't set it as the working directory, so relative paths fail
echo "Fixing CSV paths in install.sql..."
# Handle paths like './File.csv' -> '/docker-entrypoint-initdb.d/File.csv'
sed -i.bak "s|FROM '\./|FROM '/docker-entrypoint-initdb.d/|g" adventureworks-data/install.sql
# Handle paths like 'File.csv' -> '/docker-entrypoint-initdb.d/File.csv'
sed -i.bak "s|FROM '\([A-Z]\)|FROM '/docker-entrypoint-initdb.d/\1|g" adventureworks-data/install.sql
rm -f adventureworks-data/install.sql.bak

# Count CSV files
CSV_COUNT=$(ls -1 adventureworks-data/*.csv 2>/dev/null | wc -l)

# Clean up
echo "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo ""
echo "✓ AdventureWorks setup complete!"
echo "  - install.sql: ✓"
echo "  - CSV files: $CSV_COUNT"
echo ""
echo "The database will be automatically initialized when you run 'docker-compose up'."

