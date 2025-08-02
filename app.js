document.addEventListener('DOMContentLoaded', () => {
    const initialCenter = [34.853667, 135.472041];
    // 地図の初期化
    const map = L.map('map').setView(initialCenter, 15);

    // スケールバーを右下に追加
    L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 150 }).addTo(map);

    // 国土地理院タイルレイヤー
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
        attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"
    }).addTo(map);

    // --- 変数定義 ---
    let imageOverlay = null; // 表示中の画像レイヤーを保持する変数
    const currentImage = new Image(); // 表示中の画像のImageオブジェクトを保持
    let centerMarker = null; // 地図の中心を示すマーカー
    let isCenteringMode = false; // 中心座標設定モードのフラグ
    let dragHandles = []; // ドラッグハンドル（角）の配列
    let isDragging = false; // ドラッグ中かどうかのフラグ
    let dragCornerIndex = -1; // ドラッグ中の角のインデックス

    // --- 初期マーカーの設置 ---
    centerMarker = L.marker(initialCenter).addTo(map);
    
    // ドラッグハンドル用の専用ペインを作成
    map.createPane('dragHandles');
    map.getPane('dragHandles').style.zIndex = 650; // オーバーレイより上に表示


    // --- DOM要素の取得 ---
    const imageInput = document.getElementById('imageInput');
    const loadImageBtn = document.getElementById('loadImageBtn');
    const centerCoordBtn = document.getElementById('centerCoordBtn');
    const scaleInput = document.getElementById('scaleInput');
    const opacityInput = document.getElementById('opacityInput');
    const latInput = document.getElementById('latInput');
    const lngInput = document.getElementById('lngInput');
    const mapContainer = document.getElementById('map');

    // GPS値読込用の要素取得
    const gpsCsvInput = document.getElementById('gpsCsvInput');
    const loadGpsBtn = document.getElementById('loadGpsBtn');

    // GeoJSON読込用の要素取得
    const geojsonInput = document.getElementById('geojsonInput');
    const loadGeojsonBtn = document.getElementById('loadGeojsonBtn');

    // --- 関数定義 ---

    /**
     * ドラッグハンドルを削除する
     */
    function removeDragHandles() {
        dragHandles.forEach(handle => {
            if (map.hasLayer(handle)) {
                map.removeLayer(handle);
            }
        });
        dragHandles = [];
    }

    /**
     * 画像の四隅にドラッグハンドルを追加する
     * @param {L.LatLngBounds} bounds 画像の境界
     */
    function createDragHandles(bounds) {
        removeDragHandles();
        
        const corners = [
            bounds.getNorthWest(), // 左上
            bounds.getNorthEast(), // 右上
            bounds.getSouthEast(), // 右下
            bounds.getSouthWest()  // 左下
        ];
        
        corners.forEach((corner, index) => {
            
            // カスタムアイコンを作成
            const handleIcon = L.divIcon({
                className: 'drag-handle-icon',
                html: '<div style="width: 12px; height: 12px; background-color: #ff0000; border: 2px solid #ffffff; border-radius: 50%; cursor: pointer;"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            
            const handle = L.marker(corner, {
                icon: handleIcon,
                draggable: false,
                pane: 'dragHandles'
            }).addTo(map);
            
            // ツールチップを追加
            handle.bindTooltip('ドラッグしてサイズ変更', {
                permanent: false,
                direction: 'top',
                offset: [0, -10],
                className: 'drag-handle-tooltip'
            });
            
            // マウスホバー時のカーソル変更
            handle.on('mouseover', () => {
                // 角の位置に応じてカーソルを変更
                const cursors = ['nw-resize', 'ne-resize', 'se-resize', 'sw-resize'];
                map.getContainer().style.cursor = cursors[index];
            });
            
            handle.on('mouseout', () => {
                if (!isDragging) {
                    map.getContainer().style.cursor = '';
                }
            });
            
            handle.on('mousedown', (e) => {
                isDragging = true;
                dragCornerIndex = index;
                map.dragging.disable();
                e.originalEvent.preventDefault();
            });
            
            dragHandles.push(handle);
        });
    }

    /**
     * ドラッグ中に画像の境界を更新する
     * @param {L.LatLng} newCornerPos 新しい角の位置
     * @param {number} cornerIndex 角のインデックス
     */
    function updateImageBounds(newCornerPos, cornerIndex) {
        if (!imageOverlay) return;
        
        const currentBounds = imageOverlay.getBounds();
        let newBounds;
        
        switch (cornerIndex) {
            case 0: // 左上
                newBounds = L.latLngBounds(
                    newCornerPos,
                    currentBounds.getSouthEast()
                );
                break;
            case 1: // 右上
                newBounds = L.latLngBounds(
                    L.latLng(newCornerPos.lat, currentBounds.getWest()),
                    L.latLng(currentBounds.getSouth(), newCornerPos.lng)
                );
                break;
            case 2: // 右下
                newBounds = L.latLngBounds(
                    currentBounds.getNorthWest(),
                    newCornerPos
                );
                break;
            case 3: // 左下
                newBounds = L.latLngBounds(
                    L.latLng(newCornerPos.lat, newCornerPos.lng),
                    L.latLng(currentBounds.getNorth(), currentBounds.getEast())
                );
                break;
        }
        
        if (newBounds) {
            imageOverlay.setBounds(newBounds);
            createDragHandles(newBounds);
        }
    }

    /**
     * 緯度・経度の入力フィールドを更新する
     * @param {L.LatLng} latlng 表示する座標
     */
    function updateCoordInputs(latlng) {
        if (latlng) {
            latInput.value = latlng.lat.toFixed(6);
            lngInput.value = latlng.lng.toFixed(6);
        }
    }

    updateCoordInputs(L.latLng(initialCenter)); // 初期座標を表示

    /**
     * opacityInputから透過度の値を取得する（0-1の範囲）
     * @returns {number} 透過度（0-1）
     */
    function getDisplayOpacity() {
        const opacityValue = parseInt(opacityInput.value, 10);
        // 値が無効な場合は0.5を適用
        const displayOpacity = !isNaN(opacityValue) && opacityValue >= 0 && opacityValue <= 100 ? opacityValue / 100 : 0.5;
        return displayOpacity;
    }

    /**
     * 現在の画像と設定に基づいて地図上の画像オーバーレイを更新する
     */
    function updateImageDisplay() {
        // 表示する画像がない場合、または画像がまだ読み込まれていない場合は何もしない
        if (!currentImage.src || !currentImage.complete) {
            return;
        }

        // 既存の画像を削除
        if (imageOverlay) {
            map.removeLayer(imageOverlay);
            removeDragHandles();
        }

        const scale = parseFloat(scaleInput.value);
        const displayScale = !isNaN(scale) && scale > 0 ? scale : 0.3; // 値が無効な場合は0.3を適用

        const displayOpacity = getDisplayOpacity();
        const mapSize = map.getSize();
        const mapCenterLatLng = map.getCenter();

        // 画像の自然なサイズを使用し、ゼロ除算を避ける
        if (currentImage.naturalWidth === 0 || currentImage.naturalHeight === 0) {
            console.error("無効な画像サイズです。");
            return;
        }
        const imageAspectRatio = currentImage.naturalHeight / currentImage.naturalWidth;
        const displayWidthPx = mapSize.x * displayScale;
        const displayHeightPx = displayWidthPx * imageAspectRatio; // アスペクト比を維持
        const centerPoint = map.latLngToLayerPoint(mapCenterLatLng);
        const topLeftPoint = L.point(centerPoint.x - displayWidthPx / 2, centerPoint.y - displayHeightPx / 2);
        const bottomRightPoint = L.point(centerPoint.x + displayWidthPx / 2, centerPoint.y + displayHeightPx / 2);

        // L.imageOverlayにはLatLngBoundsが必要
        const bounds = L.latLngBounds(map.layerPointToLatLng(topLeftPoint), map.layerPointToLatLng(bottomRightPoint));

        imageOverlay = L.imageOverlay(currentImage.src, bounds, {
            opacity: displayOpacity // 初期透過度を設定
        }).addTo(map);
        
        // ドラッグハンドルを追加
        createDragHandles(bounds);
    }

    /**
     * 画像の透過度のみを更新する
     */
    function updateOpacity() {
        if (!imageOverlay) return;
        imageOverlay.setOpacity(getDisplayOpacity());
    }

    // --- イベントリスナー設定 ---

    // 画像ファイル選択イベント
    imageInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return; // ファイル選択がキャンセルされた場合は何もしない

        const reader = new FileReader();

        // FileReaderの読み込みが完了した時
        reader.onload = (e) => {
            // 画像データの読み込みが成功した時
            currentImage.onload = () => {
                // 画像サイズが正しく取得されているかチェック
                if (currentImage.naturalWidth === 0 || currentImage.naturalHeight === 0) {
                    // alertの代わりにカスタムメッセージボックスを使用
                    const messageBox = document.createElement('div');
                    messageBox.style.cssText = `
                            position: fixed;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                            background-color: white;
                            padding: 20px;
                            border: 1px solid #ccc;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                            z-index: 10000;
                            border-radius: 8px;
                            font-family: sans-serif;
                            text-align: center;
                        `;
                    messageBox.innerHTML = `
                            <p>有効な画像ファイルではありません。別のファイルを選択してください。</p>
                            <button onclick="this.parentNode.remove()" style="
                                padding: 8px 16px;
                                margin-top: 10px;
                                border: none;
                                background-color: #007bff;
                                color: white;
                                border-radius: 4px;
                                cursor: pointer;
                            ">OK</button>
                        `;
                    document.body.appendChild(messageBox);
                    return;
                }
                updateImageDisplay();
            };
            // 画像データの読み込みが失敗した時
            currentImage.onerror = () => {
                // alertの代わりにカスタムメッセージボックスを使用
                const messageBox = document.createElement('div');
                messageBox.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background-color: white;
                        padding: 20px;
                        border: 1px solid #ccc;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        z-index: 10000;
                        border-radius: 8px;
                        font-family: sans-serif;
                        text-align: center;
                    `;
                messageBox.innerHTML = `
                        <p>画像の読み込みに失敗しました。ファイルが破損している可能性があります。</p>
                        <button onclick="this.parentNode.remove()" style="
                            padding: 8px 16px;
                            margin-top: 10px;
                            border: none;
                            background-color: #007bff;
                            color: white;
                            border-radius: 4px;
                            cursor: pointer;
                        ">OK</button>
                    `;
                document.body.appendChild(messageBox);
            };
            // FileReaderで読み込んだデータURLをImageオブジェクトに設定
            currentImage.src = e.target.result;
        };

        // FileReaderでファイルの読み込みを開始
        reader.readAsDataURL(file);
        event.target.value = ''; // 同じファイルを連続して選択できるようにリセット
    });

    // 「画像読込」ボタンクリックイベント
    loadImageBtn.addEventListener('click', () => imageInput.click());

    // 表示倍率変更イベント
    scaleInput.addEventListener('input', updateImageDisplay);

    // 透過度変更イベント
    opacityInput.addEventListener('input', updateOpacity);

    // 「中心座標」ボタンクリックイベント
    centerCoordBtn.addEventListener('click', () => {
        isCenteringMode = !isCenteringMode; // モードをトグル
        centerCoordBtn.classList.toggle('active', isCenteringMode);
        mapContainer.style.cursor = isCenteringMode ? 'crosshair' : '';

        // 画像オーバーレイが存在すれば削除
        if (imageOverlay) {
            map.removeLayer(imageOverlay);
            removeDragHandles();
            imageOverlay = null;
        }
    });

    // 地図クリックイベント (中心座標設定モード時)
    map.on('click', (e) => {
        if (!isCenteringMode) return; // モードがオフなら何もしない

        const clickedLatLng = e.latlng;

        // 既存の中心マーカーがあれば削除
        if (centerMarker) {
            map.removeLayer(centerMarker);
        }

        // 新しいマーカーを追加して保持
        centerMarker = L.marker(clickedLatLng).addTo(map);
        updateCoordInputs(clickedLatLng); // 座標表示を更新

        // 地図の中心をクリック位置に移動
        map.setView(clickedLatLng);

        // 一度クリックしたらモードを自動的に解除
        isCenteringMode = false;
        centerCoordBtn.classList.remove('active');
        mapContainer.style.cursor = '';
    });

    // --- ドラッグイベントハンドラー ---
    map.on('mousemove', (e) => {
        if (isDragging && dragCornerIndex >= 0) {
            updateImageBounds(e.latlng, dragCornerIndex);
        }
    });

    map.on('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            dragCornerIndex = -1;
            map.dragging.enable();
        }
    });

    // ウィンドウ全体でのマウスアップイベント（地図外でマウスを離した場合）
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            dragCornerIndex = -1;
            map.dragging.enable();
        }
    });

    // --- GPS値読込イベント ---
    loadGpsBtn.addEventListener('click', () => gpsCsvInput.click());

    // --- GeoJSON読込イベント ---
    loadGeojsonBtn.addEventListener('click', () => geojsonInput.click());

    // 度分秒文字列→度（実数）変換関数
    function dmsStrToDeg(dmsStr, isLongitude = false) {
        if (!dmsStr) return NaN;
        
        // 緯度: 8文字、経度: 9文字に調整
        const targetLength = isLongitude ? 9 : 8;
        let paddedStr = dmsStr.toString().padEnd(targetLength, '0');
        
        if (isLongitude) {
            // 経度: 3桁度 + 2桁分 + 2桁秒整数 + 小数部
            const deg = parseInt(paddedStr.slice(0, 3), 10);
            const min = parseInt(paddedStr.slice(3, 5), 10);
            const secInt = parseInt(paddedStr.slice(5, 7), 10);
            const secDecimal = parseFloat('0.' + paddedStr.slice(7));
            const sec = secInt + secDecimal;
            const result = deg + min / 60 + sec / 3600;
            // console.log('経度計算:', { dmsStr, paddedStr, deg, min, secInt, secDecimal, sec, result });
            return result;
        } else {
            // 緯度: 2桁度 + 2桁分 + 2桁秒整数 + 小数部
            const deg = parseInt(paddedStr.slice(0, 2), 10);
            const min = parseInt(paddedStr.slice(2, 4), 10);
            const secInt = parseInt(paddedStr.slice(4, 6), 10);
            const secDecimal = parseFloat('0.' + paddedStr.slice(6));
            const sec = secInt + secDecimal;
            const result = deg + min / 60 + sec / 3600;
            // console.log('緯度計算:', { dmsStr, paddedStr, deg, min, secInt, secDecimal, sec, result });
            return result;
        }
    }

    gpsCsvInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            // ファイルを読み込み。1行目はヘッダーとしてスキップ
            let markerCount = 0; // マーカー作成件数を初期化
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length < 5) continue; // 最低5列(E列まで)必要
                
                // C列とG列をスペース区切りで結合してname
                const name = (row[2] || '') + ' ' + (row[6] || '');
                const lat = dmsStrToDeg(row[3], false); // D列（3番目、0始まりで3）
                const lng = dmsStrToDeg(row[4], true);  // E列（4番目、0始まりで4）
                
                if (!name.trim() || isNaN(lat) || isNaN(lng)) continue;
                if (lat <= 0 || lng <= 0) continue;
                markerCount++; // マーカーのカウントアップ
                
                if (markerCount === 1) {
                    console.log('Marker 1件目:', { name, latStr: row[3], lngStr: row[4], lat, lng });
                }
                const marker = L.marker([lat, lng]).addTo(map);
                marker.bindPopup(name);
            }
            console.log(`GPS値からマーカーを作成しました: ${markerCount}件`);
        };
        reader.readAsArrayBuffer(file);
        event.target.value = '';
    });

    // GeoJSONファイル読み込み処理
    geojsonInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const geojsonData = JSON.parse(e.target.result);
                
                // GeoJSONデータを地図に追加
                L.geoJSON(geojsonData, {
                    style: function(feature) {
                        return {
                            color: '#ff7800',
                            weight: 2,
                            opacity: 1,
                            fillColor: 'transparent',
                            fillOpacity: 0
                        };
                    },
                    pointToLayer: function(feature, latlng) {
                        return L.circleMarker(latlng, {
                            radius: 6,
                            fillColor: '#ff7800',
                            color: '#000',
                            weight: 1,
                            opacity: 1,
                            fillOpacity: 0.8
                        });
                    },
                    onEachFeature: function(feature, layer) {
                        if (feature.properties && feature.properties.name) {
                            layer.bindPopup(feature.properties.name);
                        }
                    }
                }).addTo(map);
                
                console.log('GeoJSONファイルを読み込みました');
            } catch (error) {
                console.error('GeoJSONファイルの読み込みに失敗しました:', error);
                
                // エラーメッセージを表示
                const messageBox = document.createElement('div');
                messageBox.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background-color: white;
                    padding: 20px;
                    border: 1px solid #ccc;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    z-index: 10000;
                    border-radius: 8px;
                    font-family: sans-serif;
                    text-align: center;
                `;
                messageBox.innerHTML = `
                    <p>GeoJSONファイルの読み込みに失敗しました。<br>有効なGeoJSONファイルを選択してください。</p>
                    <button onclick="this.parentNode.remove()" style="
                        padding: 8px 16px;
                        margin-top: 10px;
                        border: none;
                        background-color: #007bff;
                        color: white;
                        border-radius: 4px;
                        cursor: pointer;
                    ">OK</button>
                `;
                document.body.appendChild(messageBox);
            }
        };
        
        reader.readAsText(file);
        event.target.value = '';
    });
});
