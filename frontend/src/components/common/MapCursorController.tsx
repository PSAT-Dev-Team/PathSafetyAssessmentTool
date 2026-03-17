import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';

const TRASH_CURSOR_URL = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgLTk2MCA5NjAgOTYwIiB3aWR0aD0iMjQiIGZpbGw9IiNkYzI2MjYiPjxwYXRoIGQ9Ik0yODAtMTIwcS0zMyAwLTU2LjUtMjMuNVQyMDAtMjAwdi01MjBoLTQwdi04MGgyMDB2LTQwaDI0MHY0MGgyMDB2ODBoLTQwdjUyMHEwIDMzLTIzLjUgNTYuNVQ2ODAtMTIwSDI4MFptNDAwLTYwMEgyODB2NTIwaDQwMHYtNTIwWk0zNjAtMjgwaDgwdi0zNjBoLTgwdjM2MFptMTYwIDBoODB2LTM2MGgtODB2MzYwWk0yODAtNzIwdjUyMC01MjBaIi8+PC9zdmc+";

type MapCursorMode = 'delete' | 'add' | 'default';

interface MapCursorControllerProps {
    mode: MapCursorMode;
}

export const MapCursorController: React.FC<MapCursorControllerProps> = ({ mode }) => {
    const map = useMap();

    useEffect(() => {
        const container = map.getContainer();

        // Remove all custom cursor classes first
        container.classList.remove('trash-cursor-mode', 'add-cursor-mode');

        // Add specific class based on mode
        if (mode === 'delete') {
            container.classList.add('trash-cursor-mode');
        } else if (mode === 'add') {
            container.classList.add('add-cursor-mode');
        }
    }, [map, mode]);

    return (
        <style>{`
      .trash-cursor-mode,
      .trash-cursor-mode.leaflet-container,
      .trash-cursor-mode .leaflet-interactive,
      .trash-cursor-mode .leaflet-grab {
        cursor: url('${TRASH_CURSOR_URL}') 12 12, pointer !important;
      }
      .add-cursor-mode,
      .add-cursor-mode.leaflet-container,
      .add-cursor-mode .leaflet-interactive,
      .add-cursor-mode .leaflet-grab {
        cursor: crosshair !important;
      }
    `}</style>
    );
};
