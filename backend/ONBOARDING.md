# Onboarding notes — backend

This file lists manual steps for installing system-level dependencies that `Run-PSAT.bat` may not be able to install automatically.

Common issues
- Packages like `geopandas`, `gdal`, `fiona`, `pyogrio`, `rtree` often require OS-level libraries or wheels unavailable to pip on some platforms.

Recommended (conda) setup
1. Install Miniconda/Anaconda: https://docs.conda.io/en/latest/miniconda.html
2. Create and activate an environment:

   conda create -n psat python=3.11 -y
   conda activate psat

3. Install geospatial/system libs from `conda-forge`:

   conda install -c conda-forge gdal geopandas pyproj fiona rtree pyogrio -y

4. Install remaining pip-only requirements:

   pip install --upgrade pip
   pip install -r backend/requirements.txt

Windows notes
- If you need Excel COM automation (optional), install `pywin32`:

  pip install pywin32

If `Run-PSAT.bat` logs pip errors
- The script writes `backend/backend_pip_install.log` on pip failures and will create `backend/SETUP_NOTES.txt` with the conda instructions above. Check those files and follow the conda steps if needed.

