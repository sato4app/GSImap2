
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import type { ChangeEvent } from 'react';

// Inform TypeScript that `L` is a global variable provided by the Leaflet scripts.
declare const L: any;

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

// --- Loading and Error Screens ---

const LoadingScreen = () => (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-100 text-gray-700">
        <svg className="animate-spin h-8 w-8 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-xl font-semibold">Loading Map Resources...</p>
        <p className="text-sm">Please wait a moment.</p>
    </div>
);

const ErrorScreen = ({ message }: { message: string }) => (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-red-50 text-red-700 p-4">
        <h2 className="text-2xl font-bold mb-2">Application Error</h2>
        <p className="text-center">{message}</p>
        <p className="text-center mt-4 text-sm">Please try refreshing the page. If the problem persists, contact support.</p>
    </div>
);


// --- Main Application Component ---

function App() {
    const [isPluginReady, setIsPluginReady] = useState(false);
    const [pluginError, setPluginError] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [scale, setScale] = useState<number>(0.3);
    const [opacity, setOpacity] = useState<number>(50);
    
    const minohFallPosition: [number, number] = [34.853667, 135.472041];

    useEffect(() => {
        // This effect runs only once on component mount.
        let interval: ReturnType<typeof setInterval>;
        let timeout: ReturnType<typeof setTimeout>;

        // Start checking for the plugin.
        interval = setInterval(() => {
            // If plugin is found, update state and clear all timers.
            if (typeof L !== 'undefined' && L.distortableImageOverlay) {
                setIsPluginReady(true);
                clearInterval(interval);
                clearTimeout(timeout);
            }
        }, 100);

        // Set a timeout for the check.
        timeout = setTimeout(() => {
            clearInterval(interval);
            // After 5 seconds, if the plugin is still not available (by checking the global L object directly),
            // set an error. This avoids the "stale closure" problem.
            if (typeof L === 'undefined' || !L.distortableImageOverlay) {
                setPluginError("Failed to load a required map plugin (DistortableImageOverlay). The application cannot start.");
            }
        }, 5000); // 5-second timeout

        // The cleanup function for this effect.
        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, []); // Empty dependency array ensures this effect runs only ONCE.


    if (pluginError) {
        return <ErrorScreen message={pluginError} />;
    }

    if (!isPluginReady) {
        return <LoadingScreen />;
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
