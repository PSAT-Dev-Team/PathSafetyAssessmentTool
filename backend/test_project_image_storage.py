from pathlib import Path
import sys

import pandas as pd


sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.api.projects import routes  # noqa: E402
from app.services.project_manager import materialize_project_image  # noqa: E402


def test_materialize_project_image_uses_hardlink_when_possible(tmp_path):
    source = tmp_path / "source.jpg"
    target = tmp_path / "target.jpg"
    source.write_bytes(b"image-bytes")

    mode = materialize_project_image(source, target)

    assert mode == "hardlink"
    assert target.exists()
    assert target.read_bytes() == b"image-bytes"
    assert source.samefile(target)


def test_materialize_project_image_falls_back_to_copy(monkeypatch, tmp_path):
    source = tmp_path / "source.jpg"
    target = tmp_path / "target.jpg"
    source.write_bytes(b"image-bytes")

    def raise_cross_device(src, dst):
        raise OSError("cross-device link")

    monkeypatch.setattr("app.services.project_manager.os.link", raise_cross_device)

    mode = materialize_project_image(source, target)

    assert mode == "copy"
    assert target.exists()
    assert target.read_bytes() == b"image-bytes"
    assert not source.samefile(target)


def test_copy_project_images_updates_references_without_plain_copy(tmp_path):
    source_dir = tmp_path / "source"
    project_images_dir = tmp_path / "project" / "images"
    source_dir.mkdir(parents=True)
    source_image = source_dir / "Cam1.jpg"
    source_image.write_bytes(b"image-bytes")

    filename_df = pd.DataFrame({"FILENAME": ["Cam1.jpg"]})

    result_df = routes.copy_project_images(source_dir, filename_df, project_images_dir, filename_prefix="RoadA")

    linked_image = project_images_dir / "RoadA__Cam1.jpg"
    assert result_df.loc[0, "FILENAME"] == "RoadA__Cam1.jpg"
    assert linked_image.exists()
    assert source_image.samefile(linked_image)