import { CaptureUpdateAction } from "@excalidraw/excalidraw";
export default function Minimap({
  minimapOpen, minimapScene, apiRef, minimapDragRef, centerOnMinimap,
}) {
  if (!minimapOpen || !minimapScene.bounds) return null;
  return (
    <div className="minimap" aria-label="Diagram minimap">
      <div className="minimap-header">
        <div className="minimap-title-wrap">
          <span className="minimap-title">Minimap</span>
          <span className="minimap-count">{minimapScene.sceneCount} objects</span>
        </div>
        <div className="minimap-actions">
          <button
            type="button"
            className="minimap-action"
            onClick={() => {
              const api = apiRef.current;
              if (!api) return;
              const zoom = api.getAppState().zoom?.value || 1;
              api.updateScene({
                appState: { ...api.getAppState(), zoom: { value: Math.max(0.1, zoom / 1.2) } },
                captureUpdate: CaptureUpdateAction.NEVER,
              });
            }}
            title="Zoom out"
          >−</button>
          <button
            type="button"
            className="minimap-zoom-label"
            onClick={() => {
              const api = apiRef.current;
              if (!api) return;
              const elements = api.getSceneElements().filter((element) => !element.isDeleted);
              if (api.setViewport) api.setViewport({ target: elements, fit: "contain" });
              else api.scrollToContent?.(elements, { fitToViewport: true, animate: true });
            }}
            title="Fit diagram"
          >{Math.round((apiRef.current?.getAppState().zoom?.value || 1) * 100)}%</button>
          <button
            type="button"
            className="minimap-action"
            onClick={() => {
              const api = apiRef.current;
              if (!api) return;
              const zoom = api.getAppState().zoom?.value || 1;
              api.updateScene({
                appState: { ...api.getAppState(), zoom: { value: Math.min(8, zoom * 1.2) } },
                captureUpdate: CaptureUpdateAction.NEVER,
              });
            }}
            title="Zoom in"
          >+</button>
        </div>
      </div>
      <div
        className="minimap-viewport"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = minimapScene.bounds;
          const rect = event.currentTarget.getBoundingClientRect();
          const pad = 12;
          const width = Math.max(1, rect.width - pad * 2);
          const height = Math.max(1, rect.height - pad * 2);
          const scale = Math.min(
            width / Math.max(1, bounds.maxX - bounds.minX),
            height / Math.max(1, bounds.maxY - bounds.minY),
          );
          const offsetX = (rect.width - (bounds.maxX - bounds.minX) * scale) / 2;
          const offsetY = (rect.height - (bounds.maxY - bounds.minY) * scale) / 2;
          const x = bounds.minX + (event.clientX - rect.left - offsetX) / scale;
          const y = bounds.minY + (event.clientY - rect.top - offsetY) / scale;
          centerOnMinimap(x, y);
        }}
      >
        {(() => {
          const bounds = minimapScene.bounds;
          const width = 220;
          const height = 126;
          const scale = Math.min(
            width / Math.max(1, bounds.maxX - bounds.minX),
            height / Math.max(1, bounds.maxY - bounds.minY),
          );
          const offsetX = (width - (bounds.maxX - bounds.minX) * scale) / 2;
          const offsetY = (height - (bounds.maxY - bounds.minY) * scale) / 2;
          const toMini = (x, y) => ({
            left: offsetX + (x - bounds.minX) * scale,
            top: offsetY + (y - bounds.minY) * scale,
          });
          const moveCamera = (event) => {
            const drag = minimapDragRef.current;
            const api = apiRef.current;
            if (!drag || !api) return;
            const dx = (event.clientX - drag.startX) / scale;
            const dy = (event.clientY - drag.startY) / scale;
            const appState = api.getAppState();
            api.updateScene({
              appState: {
                ...appState,
                scrollX: drag.startScrollX - dx,
                scrollY: drag.startScrollY - dy,
              },
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          };
          const stopCamera = () => {
            minimapDragRef.current = null;
            window.removeEventListener('pointermove', moveCamera);
            window.removeEventListener('pointerup', stopCamera);
          };
          const startCamera = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const api = apiRef.current;
            if (!api || !minimapScene.viewport) return;
            const appState = api.getAppState();
            minimapDragRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              startScrollX: appState.scrollX || 0,
              startScrollY: appState.scrollY || 0,
            };
            window.addEventListener('pointermove', moveCamera);
            window.addEventListener('pointerup', stopCamera, { once: true });
          };
          return (
            <>
              {minimapScene.elements.map((element) => {
                const point = toMini(element.x, element.y);
                const type = element.type;
                const isSelected = element.isSelected;
                return (
                  <span
                    key={element.id}
                    className={`minimap-element minimap-${type}${isSelected ? ' selected' : ''}`}
                    style={{
                      ...point,
                      width: Math.max(1.5, element.width * scale),
                      height: Math.max(1.5, element.height * scale),
                    }}
                  />
                );
              })}
              {minimapScene.viewport && (() => {
                const camera = toMini(minimapScene.viewport.x, minimapScene.viewport.y);
                return (
                  <span
                    className="minimap-camera"
                    style={{
                      ...camera,
                      width: Math.max(10, minimapScene.viewport.width * scale),
                      height: Math.max(10, minimapScene.viewport.height * scale),
                    }}
                    onPointerDown={startCamera}
                    title="Drag to pan"
                  />
                );
              })()}
            </>
          );
        })()}
      </div>
      <div className="minimap-footer">
        <span>Drag viewport to pan</span>
        <button
          type="button"
          className="minimap-fit"
          onClick={() => {
              const api = apiRef.current;
              if (!api) return;
              const elements = api.getSceneElements().filter((element) => !element.isDeleted);
              if (api.setViewport) api.setViewport({ target: elements, fit: "contain" });
              else api.scrollToContent?.(elements, { fitToViewport: true, animate: true });
            }}
        >Fit</button>
      </div>
    </div>
  );
}
