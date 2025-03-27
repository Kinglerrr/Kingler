const http = require('http');
const axios = require('axios');

const ESP32_IP = 'http://192.168.38.67';

// Khởi tạo trạng thái cho các thiết bị
let deviceStates = {
    led1: 'off',    // Máy bơm
    led2: 'off',    // Quạt
    led3: 'off',    // Đèn
    awning: 'closed' // Mái che
};
let awningCurrentState = 'closed';

http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Route để lấy dữ liệu cảm biến từ ESP32
    if (req.url === '/esp32-data') {
        try {
            const response = await axios.get(`${ESP32_IP}/data`);
            const data = response.data;
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(data));
        } catch (error) {
            console.error('Error fetching sensor data from ESP32:', error);
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }

    // Route để điều khiển thiết bị (máy bơm, quạt, đèn)
    if (req.url === '/led' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const { ledId, state } = JSON.parse(body);
                deviceStates[ledId] = state; // Cập nhật trạng thái thiết bị

                // Gửi lệnh điều khiển đến ESP32
                await axios.post(`${ESP32_IP}/led`, { ledId, state });
                
                // Map device names for logging
                const deviceNames = {
                    'led1': 'Máy bơm',
                    'led2': 'Quạt',
                    'led3': 'Đèn'
                };
                
                const deviceName = deviceNames[ledId] || ledId;
                console.log(`${deviceName} được ${state === 'on' ? 'bật' : 'tắt'}`);
                
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({ 
                    message: `${deviceName} đã được ${state === 'on' ? 'bật' : 'tắt'}`
                }));
            } catch (error) {
                console.error('Error controlling device:', error);
                res.writeHead(500, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    // Route để lấy trạng thái tất cả thiết bị
    if (req.url === '/led-states' && req.method === 'GET') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(deviceStates));
        return;
    }

    // Route để lấy trạng thái mái che
    if (req.url === '/awning-status' && req.method === 'GET') {
        try {
            const response = await axios.get(`${ESP32_IP}/awning-status`, {
                timeout: 5000
            });
            const data = response.data;
            
            awningCurrentState = data.isExtended ? 'opened' : 'closed';
            deviceStates.awning = awningCurrentState;
            
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                isExtended: awningCurrentState === 'opened'
            }));
        } catch (error) {
            console.error('Error fetching awning status:', error);
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }
    
    // Route để điều khiển mái che
    if (req.url === '/awning' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const { action } = JSON.parse(body);
                const response = await axios.post(`${ESP32_IP}/awning`, 
                    { action },
                    { timeout: 5000 }
                );
                if(response.data.success) {
                    deviceStates.awning = action === 'extend' ? 'opened' : 'closed';
                }
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify(response.data));
            } catch (error) {
                console.error('Error controlling awning:', error);
                res.writeHead(500, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }
    if (req.url === '/thresholds' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const thresholdSettings = JSON.parse(body);
                const response = await axios.post(`${ESP32_IP}/thresholds`, 
                    thresholdSettings,
                    { timeout: 5000 }
                );
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify(response.data));
            } catch (error) {
                console.error('Error updating thresholds:', error);
                res.writeHead(500, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }
    
    // Thêm endpoint để lấy giá trị ngưỡng hiện tại
    if (req.url === '/thresholds' && req.method === 'GET') {
        try {
            const response = await axios.get(`${ESP32_IP}/thresholds`, {
                timeout: 5000
            });
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(response.data));
        } catch (error) {
            console.error('Error fetching thresholds:', error);
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }
    // Route để cập nhật trạng thái thiết bị từ ESP32
if (req.url === '/update-device-state' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    req.on('end', () => {
        try {
            const { deviceId, state } = JSON.parse(body);
            deviceStates[deviceId] = state; // Cập nhật trạng thái trong web server
            
            // Map tên thiết bị để log
            const deviceNames = {
                'led1': 'Máy bơm',
                'led2': 'Quạt',
                'led3': 'Đèn'
            };
            
            const deviceName = deviceNames[deviceId] || deviceId;
            console.log(`${deviceName} đã được ${state === 'on' ? 'bật' : 'tắt'} tự động`);
            
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            console.error('Lỗi khi cập nhật trạng thái thiết bị:', error);
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({ error: error.message }));
        }
    });
    return;
}
if (req.url === '/schedule' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    req.on('end', async () => {
        try {
            const scheduleSettings = JSON.parse(body);
            const response = await axios.post(`${ESP32_IP}/schedule`, 
                scheduleSettings,
                { timeout: 5000 }
            );
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(response.data));
        } catch (error) {
            console.error('Error updating schedule:', error);
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({ error: error.message }));
        }
    });
    return;
}

if (req.url === '/schedule' && req.method === 'GET') {
    try {
        const response = await axios.get(`${ESP32_IP}/schedule`, {
            timeout: 5000
        });
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify(response.data));
    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: error.message }));
    }
    return;
}
    // Trả về giao diện HTML
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Giám sát vườn hoa thông minh</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/raphael/2.3.0/raphael.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/justgage/1.4.2/justgage.min.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            background-color: #f0f0f0;
            background-image: url('https://scx1.b-cdn.net/csz/news/800/2017/theoreticala.jpg');
            background-repeat: no-repeat;
            color: #FFFFFF;
            background-attachment: fixed;
            background-size: cover;
        }
        
        .gauge {
            display: inline-block;
            margin: 20px;
            border: 1px solid #ccc;
            padding: 10px;
            background-color: #fff;
            border-radius: 10px;
        }

        .device-controls {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin: 20px 0;
        }

        .device-control {
            background-color: rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 10px;
            backdrop-filter: blur(5px);
            min-width: 200px;
        }

        .device-status {
            display: inline-block;
            width: 100px;
            height: 50px;
            line-height: 50px;
            text-align: center;
            font-weight: bold;
            color: white;
            border-radius: 5px;
            margin: 10px;
        }

        .device-toggle {
            margin: 10px;
            padding: 10px 20px;
            font-size: 16px;
            cursor: pointer;
            border: none;
            border-radius: 5px;
            color: white;
            transition: background-color 0.3s;
            width: 150px;
        }

        .device-toggle.on {
            background-color: #28a745;
        }

        .device-toggle.off {
            background-color: #dc3545;
        }

        .device-toggle:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .device-on {
            background-color: #28a745;
        }

        .device-off {
            background-color: #dc3545;
        }

        #datetime {
            position: fixed;
            top: 10px;
            right: 10px;
            font-size: 18px;
            font-family: Arial, monospace;
            background-color: rgba(0, 0, 0, 0.5);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
        }

        .awning-control {
            background-color: rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 10px;
            backdrop-filter: blur(5px);
            margin-top: 20px;
        }

        .awning-status {
            display: inline-block;
            width: 150px;
            height: 50px;
            line-height: 50px;
            text-align: center;
            font-weight: bold;
            color: white;
            border-radius: 5px;
            margin: 10px;
        }

        .awning-opened {
            background-color: #28a745;
        }

        .awning-closed {
            background-color: #dc3545;
        }

        .device-icon {
            font-size: 24px;
            margin-bottom: 10px;
        }
              .overlay {
            height: 100%;
            width: 0;
            position: fixed;
            z-index: 1;
            top: 0;
            left: 0;
            background-color: rgba(0,0,0,0.9);
            overflow-x: hidden;
            transition: 0.5s;
        }

        .overlay-content {
            position: relative;
            top: 25%;
            text-align: center;
            margin-top: 30px;
        }

        .overlay a {
            padding: 8px;
            text-decoration: none;
            font-size: 36px;
            color: #818181;
            display: block;
            transition: 0.3s;
        }

        .overlay a:hover {
            color: #f1f1f1;
        }

        .overlay .closebtn {
            position: absolute;
            top: 10px;
            right: 25px;
            font-size: 40px;
            cursor: pointer;
            color: white;
        }

        /* Open Menu Button */
        .menu-button {
            position: fixed;
            top: 10px;
            left: 10px;
            font-size: 30px;
            color: white;
            background-color: rgba(0, 0, 0, 0.5);
            border: none;
            padding: 10px;
            border-radius: 5px;
            cursor: pointer;
            z-index: 2;
        }

        dialog {
            width: 1000px;
            border: none;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            padding: 100px;
            text-align: center;
        }

        dialog::backdrop {
            background: rgba(0, 0, 0, 0.6);
        }
            dialog h3 {
            font-size: 24px;
            margin-bottom: 20px;
            color: #333;
        }

        dialog label {
            font-size: 18px;
            display: block;
            margin-bottom: 10px;
            color: #555;
        }

        dialog input {
            font-size: 16px;
            padding: 10px;
            width: 20%;
            border: 1px solid #ccc;
            border-radius: 5px;
            margin-bottom: 20px;
        }

        dialog button {
            font-size: 18px;
            padding: 10px 20px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.3s;
        }

        dialog button:hover {
            background-color: #0056b3;
        }
            .schedule-label {
    display: flex;
    align-items: right;
    gap: 10px;
    margin-bottom: 15px;
    cursor: pointer;
}

.schedule-label input[type="checkbox"] {
    margin: 0;
    margin-right: 10px;
}
    input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    height: 10px;
    border-radius: 5px;
    background: #d3d3d3;
    outline: none;
    opacity: 0.7;
    -webkit-transition: .2s;
    transition: opacity .2s;
}

input[type="range"]:hover {
    opacity: 1;
}

input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #4CAF50;
    cursor: pointer;
}

input[type="range"]::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #4CAF50;
    cursor: pointer;
}
    </style>
</head>
<body>
    <h1>Điều khiển vườn hoa thông minh</h1>
    <div class="gauge" id="tempGauge"></div>
    <div class="gauge" id="humidityGauge"></div>
    <div class="gauge" id="lightGauge"></div>
    <div class="gauge" id="moistureGauge"></div>

    <div class="device-controls">
        <div class="device-control">
            <div class="device-icon">💧</div>
            <h3>Máy bơm</h3>
            <div id="led1Status" class="device-status device-off">TẮT</div>
            <button id="led1Toggle" class="device-toggle off" onclick="toggleDevice('led1')">Bật máy bơm</button>
        </div>
        <div class="device-control">
            <div class="device-icon">💨</div>
            <h3>Quạt</h3>
            <div id="led2Status" class="device-status device-off">TẮT</div>
            <button id="led2Toggle" class="device-toggle off" onclick="toggleDevice('led2')">Bật quạt</button>
        </div>
        <div class="device-control">
            <div class="device-icon">💡</div>
            <h3>Đèn</h3>
            <div id="led3Status" class="device-status device-off">TẮT</div>
            <button id="led3Toggle" class="device-toggle off" onclick="toggleDevice('led3')">Bật đèn</button>
        </div>
        <div class="awning-control">
            <div class="device-icon">🏠</div>
            <h3>Mái che</h3>
            <div id="awningStatus" class="awning-status awning-closed">ĐÓNG</div>
            <button id="awningToggle" class="device-toggle off" onclick="toggleawning('awning')">Mở mái che</button>
        </div>
    </div>
<div id="myNav" class="overlay">
  <a href="javascript:void(0)" class="closebtn" onclick="closeNav()">&times;</a>
  <div class="overlay-content">
   <div class="device-controls">
    <div class="device-control">
        <div class="device-icon">⚙️</div>
        <h3>Cài đặt tự động</h3>
        <div class="auto-mode">
            <label style="color: white;">
                <input type="checkbox" id="autoMode"> Kích hoạt chế độ tự động
            </label>
        </div>
        <div class="threshold-settings" style="margin-top: 15px;">
    <div style="margin-bottom: 20px;">
        <label style="color: white; display: block; margin-bottom: 5px;">
            Nhiệt độ: <span id="tempValue">30</span>°C
        </label>
        <input type="range" id="tempThreshold" 
               min="0" max="50" step="0.5" value="30"
               style="width: 80%;" 
               oninput="updateSliderValue('tempValue', this.value)">
    </div>
    
    <div style="margin-bottom: 20px;">
        <label style="color: white; display: block; margin-bottom: 5px;">
            Độ ẩm đất: <span id="moistureValue">30</span>%
        </label>
        <input type="range" id="moistureThreshold" 
               min="0" max="100" step="1" value="30"
               style="width: 80%;" 
               oninput="updateSliderValue('moistureValue', this.value)">
    </div>
    
    <div style="margin-bottom: 20px;">
        <label style="color: white; display: block; margin-bottom: 5px;">
            Ánh sáng: <span id="lightValue">300</span> Lux
        </label>
        <input type="range" id="lightThreshold" 
               min="0" max="1000" step="10" value="300"
               style="width: 80%;" 
               oninput="updateSliderValue('lightValue', this.value)">
    </div>

    <button onclick="updateThresholds()" 
            class="device-toggle on"
            style="width: 80%; margin-top: 10px;">
        Cập nhật ngưỡng
    </button>
</div>
    </div>
    
    <!-- Thêm phần lịch trình mái che vào đây -->
    <div class="device-control">
        <div class="device-icon">⏰</div>
        <h3>Lịch trình mái che</h3>
        <div class="schedule-toggle">
            <label style="color: white;">
                <input type="checkbox" id="scheduleEnabled" onchange="updateSchedule()">
                Bật lịch trình tự động
            </label>
        </div>
        <div class="schedule-times" style="margin-top: 15px;">
            <div style="margin-bottom: 10px;">
                <label style="color: white; display: block; margin-bottom: 5px;">
                    Thời gian mở:
                </label>
                <input type="time" id="openTime" onchange="updateSchedule()">
            </div>
            <div style="margin-bottom: 10px;">
                <label style="color: white; display: block; margin-bottom: 5px;">
                    Thời gian đóng:
                </label>
                <input type="time" id="closeTime" onchange="updateSchedule()">
            </div>
        </div>
    </div>
   </div>
  </div>
</div>

    <!-- Open Menu Button -->
    <button class="menu-button" onclick="openNav()">&#9776; Menu</button>

    <!-- Date and Time Adjustment Dialog -->
    <dialog id="dateTimeDialog">
    <h3>Cài đặt thời gian đóng/mở mái che</h3>
   <div class="schedule-toggle">
    <label class="schedule-label">
        <input type="checkbox" id="scheduleEnabled" onchange="updateSchedule()">Bật lịch trình tự động</label>
</div>
            <label for="openTime">Thời gian mở:</label>
            <input type="time" id="openTime" onchange="updateSchedule()">
        </div>
        <div>
            <label for="closeTime">Thời gian đóng:</label>
            <input type="time" id="closeTime" onchange="updateSchedule()">
        </div>
        <button onclick="closeDialog()">Save</button>
    </div>
</dialog>
    <div id="errorMessage" style="color: red;"></div>
    <div id="datetime"></div>

    <script>
    function openNav() {
  document.getElementById("myNav").style.width = "100%";
}

function closeNav() {
  document.getElementById("myNav").style.width = "0%";
    }
        let tempGauge, humidityGauge, lightGauge, moistureGauge;
        let lastToggleTime = 0;
        const debounceTime = 300;
        let deviceStates = {
            led1: 'off',  // máy bơm
            led2: 'off',  // quạt
            led3: 'off',  // đèn
            awning: 'closed'
        };

        function updateTime() {
            var now = new Date();
            var datetime = now.toLocaleString();
            document.getElementById("datetime").innerHTML = datetime;
            setTimeout(updateTime, 1000);
        }

        updateTime();

        document.addEventListener('DOMContentLoaded', function() {
            // Khởi tạo các gauge
            tempGauge = new JustGage({
                id: "tempGauge",
                value: 0,
                min: 0,
                max: 90,
                label: "Nhiệt độ (°C)",
                gaugeWidthScale: 0.6
            });

            humidityGauge = new JustGage({
                id: "humidityGauge",
                value: 0,
                min: 0,
                max: 100,
                label: "Độ ẩm không khí (%)",
                gaugeWidthScale: 0.6,
                levelColors: ["#EF5350", "#33ff33", "#6600ff"]
            });

            lightGauge = new JustGage({
                id: "lightGauge",
                value: 0,
                min: 0,
                max: 1000,
                label: "Ánh sáng (Lux)",
                gaugeWidthScale: 0.6
            });

            moistureGauge = new JustGage({
                id: "moistureGauge",
                value: 0,
                min: 0,
                max: 100,
                label: "Độ ẩm đất (%)",
                gaugeWidthScale: 0.6
            });

            console.log("Gauges initialized successfully");
            updateSensorData();
            syncDeviceStates();
            syncAwningStatus();
            setInterval(syncAwningStatus, 5000);
            setInterval(syncDeviceStates, 5000);
             loadThresholds();
             loadSchedule();
        });

        function updateSensorData() {
            fetch('/esp32-data')
                .then(res => {
                    if (!res.ok) throw new Error('HTTP error! status: ' + res.status);
                    return res.json();
                })
                .then(data => {
                    console.log("Received data:", data);
                    tempGauge.refresh(data.temperature);
                    humidityGauge.refresh(data.humidity);
                    lightGauge.refresh(data.light);
                    moistureGauge.refresh(data.moisture);
                    document.getElementById('errorMessage').innerText = '';
                })
                .catch(error => {
                    console.error('Error fetching sensor data:', error);
                    document.getElementById('errorMessage').innerText = "Lỗi: " + error.message;
                });

            setTimeout(updateSensorData, 2000);
        }
function updateSliderValue(elementId, value) {
    document.getElementById(elementId).textContent = value;
}
        function toggleDevice(deviceId) {
            const now = Date.now();
            if (now - lastToggleTime < debounceTime) {
                console.log('Debouncing...');
                return;
            }
            lastToggleTime = now;

            const newState = deviceStates[deviceId] === 'on' ? 'off' : 'on';
            const button = document.getElementById(deviceId + 'Toggle');
            button.disabled = true;

            updateDeviceStatus(deviceId, newState);

            fetch('/led', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ledId: deviceId, state: newState })
            })
            .then(res => {
                if (!res.ok) throw new Error('HTTP error! status: ' + res.status);
                return res.json();
            })
            .then(data => {
                console.log(data.message);
                deviceStates[deviceId] = newState;
            })
            .catch(error => {
                console.error('Error toggling device:', error);
                document.getElementById('errorMessage').innerText = "Lỗi: " + error.message;
                updateDeviceStatus(deviceId, deviceStates[deviceId]);
            })
            .finally(() => {
                button.disabled = false;
            });
        }

        function updateDeviceStatus(deviceId, state) {
            console.log('updateDeviceStatus called for ' + deviceId + ' with state ' + state);
            const status = document.getElementById(deviceId + 'Status');
            const toggle = document.getElementById(deviceId + 'Toggle');
            
            if (!status || !toggle) {
                console.error('Elements not found for deviceId:', deviceId);
                return;
            }
            
            status.textContent = state === 'on' ? 'BẬT' : 'TẮT';
            status.className = 'device-status ' + (state === 'on' ? 'device-on' : 'device-off');
            
            let deviceName;
            switch(deviceId) {
                case 'led1': deviceName = 'máy bơm'; break;
                case 'led2': deviceName = 'quạt'; break;
                case 'led3': deviceName = 'đèn'; break;
                default: deviceName = deviceId;
            }
            
            toggle.textContent = state === 'on' ? 'Tắt ' + deviceName : 'Bật ' + deviceName;
            toggle.className = 'device-toggle ' + state;
            console.log('Update completed for ' + deviceId);
        }

        function syncDeviceStates() {
    fetch('/led-states')
        .then(res => res.json())
        .then(data => {
            console.log('Data received from ESP32:', data);
            // Cập nhật trạng thái cho tất cả thiết bị
            Object.keys(data).forEach(deviceId => {
                const newState = data[deviceId];
                console.log('Current state for ' + deviceId + ':', deviceStates[deviceId]);
                console.log('New state for ' + deviceId + ':', newState);
                if (deviceStates[deviceId] !== newState) {
                    console.log('Updating ' + deviceId + ' from ' + deviceStates[deviceId] + ' to ' + newState);
                    deviceStates[deviceId] = newState;
                    updateDeviceStatus(deviceId, newState);
                }
            });
        })
        .catch(error => console.error('Lỗi khi đồng bộ trạng thái thiết bị:', error));
}

        async function syncAwningStatus() {
            try {
                const response = await fetch('/awning-status');
                const data = await response.json();
                const newState = data.isExtended ? 'opened' : 'closed';
                
                if (deviceStates.awning !== newState) {
                    deviceStates.awning = newState;
                    updateawningStatus(newState);
                }
            } catch (error) {
                console.error('Error syncing awning status:', error);
            }
        }
function updateThresholds() {
    const settings = {
        autoMode: document.getElementById('autoMode').checked,
        tempThreshold: parseFloat(document.getElementById('tempThreshold').value),
        moistureThreshold: parseFloat(document.getElementById('moistureThreshold').value),
        lightThreshold: parseInt(document.getElementById('lightThreshold').value)
    };

    fetch('/thresholds', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('Cập nhật ngưỡng thành công');
        }
    })
    .catch(error => {
        console.error('Error updating thresholds:', error);
        alert('Lỗi khi cập nhật ngưỡng');
    });
}

// Thêm hàm để lấy giá trị ngưỡng hiện tại
function loadThresholds() {
    fetch('/thresholds')
        .then(res => res.json())
        .then(data => {
            document.getElementById('autoMode').checked = data.autoMode;
            
            // Cập nhật cả slider và giá trị hiển thị
            document.getElementById('tempThreshold').value = data.tempThreshold;
            document.getElementById('tempValue').textContent = data.tempThreshold;
            
            document.getElementById('moistureThreshold').value = data.moistureThreshold;
            document.getElementById('moistureValue').textContent = data.moistureThreshold;
            
            document.getElementById('lightThreshold').value = data.lightThreshold;
            document.getElementById('lightValue').textContent = data.lightThreshold;
        })
        .catch(error => console.error('Error loading thresholds:', error));
}

        async function toggleawning() {
            const now = Date.now();
            if (now - lastToggleTime < debounceTime) return;
            lastToggleTime = now;

            const button = document.getElementById('awningToggle');
            button.disabled = true;

            const currentState = deviceStates.awning;
            const action = currentState === 'opened' ? 'retract' : 'extend';
            
            try {
                const response = await fetch('/awning', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ action })
                });

                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }

                const data = await response.json();
                const newState = action === 'extend' ? 'opened' : 'closed';
                deviceStates.awning = newState;
                updateawningStatus(newState);
            } catch (error) {
                console.error('Error toggling awning:', error);
                document.getElementById('errorMessage').innerText = "Lỗi: " + error.message;
            } finally {
                button.disabled = false;
            }
        }

        function updateawningStatus(state) {
            const status = document.getElementById('awningStatus');
            const toggle = document.getElementById('awningToggle');
            
            status.textContent = state === 'opened' ? 'MỞ' : 'ĐÓNG';
            status.className = 'awning-status awning-' + state;
            
            toggle.textContent = state === 'opened' ? 'Đóng mái che' : 'Mở mái che';
            toggle.className = 'device-toggle ' + (state === 'opened' ? 'on' : 'off');
        }
            function updateSchedule() {
    const settings = {
        enabled: document.getElementById('scheduleEnabled').checked,
        openTime: document.getElementById('openTime').value,
        closeTime: document.getElementById('closeTime').value
    };

    fetch('/schedule', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            console.log('Schedule updated successfully');
        }
    })
    .catch(error => console.error('Error updating schedule:', error));
}

function loadSchedule() {
    fetch('/schedule')
        .then(res => res.json())
        .then(data => {
            document.getElementById('scheduleEnabled').checked = data.enabled;
            document.getElementById('openTime').value = data.openTime;
            document.getElementById('closeTime').value = data.closeTime;
        })
        .catch(error => console.error('Error loading schedule:', error));
}
    </script>
</body>
</html>`);
}).listen(3000);

console.log('Server running at http://localhost:3000/');
