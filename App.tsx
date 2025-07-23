
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import type { ChangeEvent } from 'react';

// Inform TypeScript that `L` is a global variable provided by the Leaflet scripts.
declare const L: any;
// Also type window to avoid errors on window.L
declare global {
    interface Window {
        L: any;
    }
}


// --- SVG Icon Components ---

const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L6.293 6.707z" clipRule="evenodd" />
    </svg>
);

// --- UI Components ---

interface ControlsProps {
    scale: number;
    opacity: number;
    onScaleChange: (value: number) => void;
    onOpacityChange: (value: number) => void;
    onImageUpload: (dataUrl: string) => void;
}

const Controls: React.FC<ControlsProps> = ({ scale, opacity, onScaleChange, onOpacityChange, onImageUpload }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUploadClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result;
            if (typeof result === 'string') {
                const img = new Image();
                img.onload = () => {
                    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                        alert("Invalid image file. Please select another file.");
                        return;
                    }
                    onImageUpload(result);
                };
                img.onerror = () => {
                    alert("Failed to load image. The file may be corrupted.");
                };
                img.src = result;
            }
        };
        reader.readAsDataURL(file);
        event.target.value = ''; // Allow re-uploading the same file
    }, [onImageUpload]);

    return (
        <div className="absolute top-4 right-4 z-[1000] p-4 bg-white/80 backdrop-blur-sm rounded-lg shadow-lg w-72 flex flex-col gap-4">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png, image/jpeg, image/gif"
                className="hidden"
            />
            <button
                onClick={handleUploadClick}
                className="flex items-center justify-center w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 shadow"
            >
                <UploadIcon />
                Load Image
            </button>
            <div className="flex flex-col gap-2">
                <label htmlFor="scaleInput" className="text-sm font-medium text-gray-700">Display Scale ({scale.toFixed(2)})</label>
                <input
                    type="range"
                    id="scaleInput"
                    min="0.1"
                    max="2"
                    step="0.05"
                    value={scale}
                    onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
            </div>
            <div className="flex flex-col gap-2">
                <label htmlFor="opacityInput" className="text-sm font-medium text-gray-700">Opacity ({opacity}%)</label>
                <input
                    type="range"
                    id="opacityInput"
                    min="0"
                    max="100"
                    step="1"
                    value={opacity}
                    onChange={(e) => onOpacityChange(parseInt(e.target.value, 10))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
            </div>
        </div>
    );
};

// --- Map Logic Component ---

interface ImageOverlayControllerProps {
    imageUrl: string | null;
    scale: number;
    opacity: number;
}

const ImageOverlayController: React.FC<ImageOverlayControllerProps> = ({ imageUrl, scale, opacity }) => {
    const map = useMap();
    const imageOverlayRef = useRef<any>(null);

    useEffect(() => {
        if (imageOverlayRef.current) {
            map.removeLayer(imageOverlayRef.current);
            imageOverlayRef.current = null;
        }

        if (!imageUrl) return;
        
        // This check is now mostly for safety; the parent component prevents this from running prematurely.
        if (typeof L.distortableImageOverlay !== 'function') {
            console.error("Attempted to use L.distortableImageOverlay before it was ready.");
            return;
        }

        const tempImg = new Image();
        tempImg.onload = () => {
            const mapSize = map.getSize();
            const mapCenterLatLng = map.getCenter();
            const imageAspectRatio = tempImg.naturalHeight / tempImg.naturalWidth;

            const displayWidthPx = mapSize.x * scale;
            const displayHeightPx = displayWidthPx * imageAspectRatio;

            const centerPoint = map.latLngToLayerPoint(mapCenterLatLng);
            const topLeftPoint = L.point(centerPoint.x - displayWidthPx / 2, centerPoint.y - displayHeightPx / 2);
            const bottomRightPoint = L.point(centerPoint.x + displayWidthPx / 2, centerPoint.y + displayHeightPx / 2);

            const topLeft = map.layerPointToLatLng(topLeftPoint);
            const topRight = map.layerPointToLatLng(L.point(bottomRightPoint.x, topLeftPoint.y));
            const bottomLeft = map.layerPointToLatLng(L.point(topLeftPoint.x, bottomRightPoint.y));
            const bottomRight = map.layerPointToLatLng(bottomRightPoint);

            const overlay = L.distortableImageOverlay(imageUrl, {
                corners: [topLeft, topRight, bottomLeft, bottomRight],
                actions: [L.DragAction, L.ScaleAction, L.DistortAction, L.RotateAction, L.LockAction],
            }).addTo(map);
            
            overlay.setOpacity(opacity / 100);
            imageOverlayRef.current = overlay;
        };
        tempImg.src = imageUrl;
        
        return () => {
            if (imageOverlayRef.current) {
                map.removeLayer(imageOverlayRef.current);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageUrl, scale, map]);

    useEffect(() => {
        if (imageOverlayRef.current) {
            imageOverlayRef.current.setOpacity(opacity / 100);
        }
    }, [opacity]);

    return null; // This component manages layers, it does not render DOM elements.
};


// --- Main Application Component ---

function App() {
    const [isPluginReady, setIsPluginReady] = useState(false);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [scale, setScale] = useState<number>(0.3);
    const [opacity, setOpacity] = useState<number>(50);
    
    const minohFallPosition: [number, number] = [34.853667, 135.472041];

    // Effect to check for the Leaflet plugin's availability.
    useEffect(() => {
        const interval = setInterval(() => {
            // Check if the global L object and the plugin are available
            if (window.L && window.L.distortableImageOverlay) {
                setIsPluginReady(true);
                clearInterval(interval);
            }
        }, 100); // Check every 100ms

        return () => clearInterval(interval); // Cleanup on component unmount
    }, []);

    if (!isPluginReady) {
        return (
            <div className="flex items-center justify-center h-screen w-screen bg-gray-100 text-gray-700">
                <div className="text-lg font-medium">Loading Map Resources...</div>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen relative">
            <MapContainer center={minohFallPosition} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer
                    attribution='&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>'
                    url="https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"
                />
                <Marker position={minohFallPosition}>
                    <Popup>箕面大滝 (Minoh Fall)</Popup>
                </Marker>
                <ImageOverlayController imageUrl={imageUrl} scale={scale} opacity={opacity} />
            </MapContainer>
            <Controls
                scale={scale}
                opacity={opacity}
                onScaleChange={setScale}
                onOpacityChange={setOpacity}
                onImageUpload={setImageUrl}
            />
        </div>
    );
}

export default App;
