"""
Platform compatibility module for handling Windows-specific dependencies.

This module provides conditional imports and stubs for Windows-only modules
like pythoncom and win32com, allowing the application to run on non-Windows systems.
"""
import platform
import sys

# Detect if we're running on Windows
IS_WINDOWS = platform.system() == "Windows"

# Conditional imports for Windows-specific modules
if IS_WINDOWS:
    try:
        import pythoncom
        import win32com.client as win32
        WINDOWS_MODULES_AVAILABLE = True
    except ImportError:
        pythoncom = None
        win32 = None
        WINDOWS_MODULES_AVAILABLE = False
        print("Warning: pywin32 not installed. Excel automation features will not be available.", file=sys.stderr)
else:
    # On non-Windows systems, create stub modules
    pythoncom = None
    win32 = None
    WINDOWS_MODULES_AVAILABLE = False


def check_windows_feature(feature_name: str):
    """
    Check if Windows-specific features are available.

    Args:
        feature_name: Name of the feature to check (for error messages)

    Raises:
        RuntimeError: If the feature is not available on this platform
    """
    if not IS_WINDOWS:
        raise RuntimeError(
            f"{feature_name} requires Windows. "
            f"Current platform: {platform.system()}"
        )

    if not WINDOWS_MODULES_AVAILABLE:
        raise RuntimeError(
            f"{feature_name} requires pywin32 package. "
            f"Please install it with: pip install pywin32"
        )


def get_excel_client():
    """
    Get the Excel COM client if available.

    Returns:
        win32com.client module or None

    Raises:
        RuntimeError: If Excel COM is not available on this platform
    """
    check_windows_feature("Excel COM automation")
    return win32


def get_pythoncom():
    """
    Get the pythoncom module if available.

    Returns:
        pythoncom module or None

    Raises:
        RuntimeError: If pythoncom is not available on this platform
    """
    check_windows_feature("COM initialization")
    return pythoncom
