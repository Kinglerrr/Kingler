#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <LiquidCrystal_I2C.h>
#include <SimpleKalmanFilter.h>
#define IN1 27
#define IN2 26
#define ENA 25
#define MAX_SPEED 190
#define MIN_SPEED 0
#define I2C_SDA 21
#define I2C_SCL 22
LiquidCrystal_I2C lcd(0x27, 16, 2);
SimpleKalmanFilter soilMoistureFilter(2, 2, 0.001);
const int dry = 0;
const int wet = 4095;
const char* ssid = "Galaxy";
const char* password = "88888888";
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 7 * 3600, 60000);
bool awningExtended = false;
bool awningRetracted = true;
unsigned long awningStartTime = 0;
bool isMoving = false;
const unsigned long AWNING_MOVE_TIME = 3000;
unsigned long lastAwningCommand = 0;
const unsigned long AWNING_KEEP_MOVING_TIMEOUT = 3000;
unsigned long lastLCDUpdate = 0;
const unsigned long LCD_UPDATE_INTERVAL = 3000;
String serverIP = "";
WebServer server(80);

// Trạng thái cho từng LED
String led1State = "off";
String led2State = "off";
String led3State = "off";
struct ScheduleSettings {
    bool enabled = false;
    String openTime = "06:00";
    String closeTime = "18:00";
};
ScheduleSettings scheduleSettings;
struct ThresholdSettings {
    bool autoMode = false;  // Chế độ tự động bật/tắt
    float tempThreshold = 30;  // Ngưỡng nhiệt độ để bật quạt
    float moistureThreshold = 30;  // Ngưỡng độ ẩm đất để bật máy bơm  
    int lightThreshold = 300;  // Ngưỡng ánh sáng để bật đèn
} thresholds;
#define DHTPIN 4
#define DHTTYPE DHT11
#define led1 13//bom
#define led2 12//quat
#define led3 14//den
#define doamdat 33
DHT dht(DHTPIN, DHTTYPE);
#define LIGHT_SENSOR_PIN 32  

void setup() {
    // Khởi tạo I2C với các chân được chỉ định rõ ràng
    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setClock(100000); // Giảm tốc độ I2C xuống 100kHz để tăng độ ổn định
    
    // Thêm delay nhỏ trước khi khởi tạo LCD
    delay(100);
    lcd.init();
    delay(50);
    lcd.backlight();
    lcd.clear();
    
    Serial.begin(115200);
    WiFi.persistent(true);
    WiFi.begin(ssid,password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(1000);
        Serial.println("Connecting to WiFi...");
    }
    serverIP = WiFi.localIP().toString();
    Serial.print("ESP32 IP Address: ");
    Serial.println(serverIP);
    dht.begin();
    timeClient.begin();

    pinMode(IN1, OUTPUT);
    pinMode(IN2, OUTPUT);
     ledcAttach(ENA, 5000, 8);
    pinMode(led1, OUTPUT);
    pinMode(led2, OUTPUT);
    pinMode(led3, OUTPUT);
    digitalWrite(led1, LOW);
    digitalWrite(led2, LOW);
    digitalWrite(led3, LOW);
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, LOW);
    lcd.setCursor(0, 0);
    lcd.print("Initializing...");
    // Định nghĩa các endpoint với CORS
    server.on("/data", HTTP_GET, handleSensorData);
    
    // Định nghĩa route để bật/tắt LED
    server.on("/led", HTTP_POST, handleLEDData);

    server.on("/awning", HTTP_POST, handleAwningControl);
    server.on("/awning-status", HTTP_GET, handleAwningStatus);
    server.on("/thresholds", HTTP_POST, handleThresholdUpdate);
    server.on("/thresholds", HTTP_GET, []() {
        DynamicJsonDocument doc(1024);
        doc["autoMode"] = thresholds.autoMode;
        doc["tempThreshold"] = thresholds.tempThreshold;
        doc["moistureThreshold"] = thresholds.moistureThreshold;
        doc["lightThreshold"] = thresholds.lightThreshold;
        
        String jsonString;
        serializeJson(doc, jsonString);
        
        server.sendHeader("Access-Control-Allow-Origin", "*");
        server.send(200, "application/json", jsonString);
    });
 // Route để lấy trạng thái của tất cả LED
    server.on("/led-states", HTTP_GET, []() {
        DynamicJsonDocument doc(1024);
        
        // Đọc trạng thái thực tế từ GPIO và in ra Serial
        bool led1_status = digitalRead(led1) == HIGH;
        bool led2_status = digitalRead(led2) == HIGH;
        bool led3_status = digitalRead(led3) == HIGH;
        
        Serial.println("Current GPIO states:");
        Serial.println("LED1: " + String(led1_status ? "HIGH" : "LOW"));
        Serial.println("LED2: " + String(led2_status ? "HIGH" : "LOW"));
        Serial.println("LED3: " + String(led3_status ? "HIGH" : "LOW"));
        
        // Cập nhật biến trạng thái
        led1State = led1_status ? "on" : "off";
        led2State = led2_status ? "on" : "off";
        led3State = led3_status ? "on" : "off";
        
        // Gửi trạng thái thực tế
        doc["led1"] = led1State;
        doc["led2"] = led2State;
        doc["led3"] = led3State;
        
        String jsonString;
        serializeJson(doc, jsonString);
        Serial.println("Sending JSON: " + jsonString);
        
        server.sendHeader("Access-Control-Allow-Origin", "*");
        server.send(200, "application/json", jsonString);
    });
server.on("/schedule", HTTP_POST, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, body);
        
        if (!error) {
            scheduleSettings.enabled = doc["enabled"] | false;
            scheduleSettings.openTime = doc["openTime"].as<String>();
            scheduleSettings.closeTime = doc["closeTime"].as<String>();
            
            server.send(200, "application/json", "{\"success\":true}");
        } else {
            server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
        }
    }
});

server.on("/schedule", HTTP_GET, []() {
    DynamicJsonDocument doc(1024);
    doc["enabled"] = scheduleSettings.enabled;
    doc["openTime"] = scheduleSettings.openTime;
    doc["closeTime"] = scheduleSettings.closeTime;
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", jsonString);
});

    // Xử lý yêu cầu OPTIONS cho các endpoint để hỗ trợ preflight
    server.begin();
    Serial.println("HTTP server started");
}
void motor_1_Tien(int speed) {
  speed = constrain(speed, MIN_SPEED, MAX_SPEED);
    digitalWrite(IN1, HIGH); // Quay tới
    digitalWrite(IN2, LOW);
    ledcWrite(ENA,speed );
}

void motor_1_Lui(int speed) {
  speed = constrain(speed, MIN_SPEED, MAX_SPEED);
    digitalWrite(IN1, LOW); // Quay lui
    digitalWrite(IN2, HIGH);
    ledcWrite(ENA,speed );
}

void motor_1_Dung() {
    digitalWrite(IN1, LOW); // Dừng động cơ
    digitalWrite(IN2, LOW);
    ledcWrite(ENA,MIN_SPEED );
}


void loop() {
    server.handleClient();
    timeClient.update();
    checkAndControlDevices();
    checkScheduledAwning();
    if (millis() - lastLCDUpdate >= LCD_UPDATE_INTERVAL) {
        updateLCDDisplay();
        lastLCDUpdate = millis();
    }
 
int currentHour = timeClient.getHours();
   
    // Track awning movement
    if (isMoving) {
        // Nếu quá thời gian timeout và vẫn chưa đạt trạng thái mong muốn, tiếp tục di chuyển
        if (millis() - awningStartTime >= AWNING_MOVE_TIME) {
            if (millis() - lastAwningCommand < AWNING_KEEP_MOVING_TIMEOUT) {
                // Nếu vẫn còn trong thời gian timeout, tiếp tục di chuyển
                if (awningExtended) {
                    motor_1_Tien(MAX_SPEED);
                } else {
                    motor_1_Lui(MAX_SPEED);
                }
            } else {
                // Dừng động cơ
                motor_1_Dung();
                isMoving = false;
            }
        }
    }
}

int getMoisturePercent() {
    // Đọc giá trị thô
    int rawValue = analogRead(doamdat);
    
    // Áp dụng bộ lọc Kalman
    float filteredValue = soilMoistureFilter.updateEstimate(rawValue);
    
    // Chuyển đổi sang phần trăm
    int percent = map(filteredValue, dry, wet, 100, 0);
    return constrain(percent, 0, 100);
}
void updateLCDDisplay() {
    static byte displayMode = 0;
    static byte retryCount = 0;
    const byte MAX_RETRIES = 3;

    // Thêm try-catch cho LCD
    while(retryCount < MAX_RETRIES) {
        Wire.beginTransmission(0x27);
        if(Wire.endTransmission() == 0) {
            break; // LCD hoạt động bình thường
        }
        // Nếu LCD không phản hồi, thử khởi tạo lại
        Wire.begin(I2C_SDA, I2C_SCL);
        delay(50);
        lcd.init();
        delay(50);
        retryCount++;
    }
    
    if(retryCount >= MAX_RETRIES) {
        Serial.println("LCD error - too many retries");
        retryCount = 0;
        return;
    }
    retryCount = 0;

    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    int light = analogRead(LIGHT_SENSOR_PIN);
    int moisturePercent = getMoisturePercent();
    String currentTime = timeClient.getFormattedTime().substring(0, 5);
    
    // Thêm try-catch cho mỗi thao tác LCD
    try {
        lcd.clear();
        delay(5); // Thêm delay nhỏ giữa các thao tác LCD
        
        switch(displayMode) {
            case 0:
                lcd.setCursor(0, 0);
                lcd.print("T:");
                lcd.print(temperature, 1);
                lcd.print("C");
                delay(5);
                
                lcd.setCursor(8, 0);
                lcd.print(currentTime);
                delay(5);
                
                lcd.setCursor(0, 1);
                lcd.print("H:");
                lcd.print(humidity, 1);
                lcd.print("%");
                break;
                
            case 1:
                lcd.setCursor(0, 0);
                lcd.print("S:");
                lcd.print(moisturePercent);
                lcd.print("%");
                delay(5);
                
                lcd.setCursor(8, 0);
                lcd.print(currentTime);
                delay(5);
                
                lcd.setCursor(0, 1);
                lcd.print("L:");
                lcd.print(map(light, 4095, 0, 0, 100));
                lcd.print("%");
                break;
                
            case 2:
                lcd.setCursor(8, 0);
                lcd.print(currentTime);
                
                lcd.setCursor(0, 0);
                lcd.print("Awning:");
                
                lcd.setCursor(0, 1);
                if (isMoving) {
                    lcd.print("Moving...");
                } else if (awningExtended) {
                    lcd.print("Opened");
                } else if (awningRetracted) {
                    lcd.print("Closed");
                } else {
                    lcd.print("Error!");
                }
                break;
        }
        
        displayMode = (displayMode + 1) % 3;
    } catch(...) {
        Serial.println("LCD update error");
    }
}
void checkAndControlDevices() {
    if (!thresholds.autoMode) return;
    
    float temp = dht.readTemperature();
    int moisture = getMoisturePercent();
    int light = analogRead(LIGHT_SENSOR_PIN);
    light = map(light, 4095, 0, 0, 1000);
    
    // Điều khiển quạt theo nhiệt độ
    if (temp > thresholds.tempThreshold && led2State != "on") {
        digitalWrite(led2, HIGH);
        led2State = "on";
        updateServerDeviceState("led2", true);  
    } else if (temp <= thresholds.tempThreshold && led2State != "off") {
        digitalWrite(led2, LOW);
        led2State = "off";
        updateServerDeviceState("led2", false);  
    }
    
    // Điều khiển máy bơm theo độ ẩm đất
    if (moisture < thresholds.moistureThreshold && led1State != "on") {
        digitalWrite(led1, HIGH);
        led1State = "on";
        updateServerDeviceState("led1", true); 
    } else if (moisture >= thresholds.moistureThreshold && led1State != "off") {
        digitalWrite(led1, LOW);
        led1State = "off";
        updateServerDeviceState("led1", false);  
    }
    
    // Điều khiển đèn theo ánh sáng
    if (light < thresholds.lightThreshold && led3State != "on") {
        digitalWrite(led3, HIGH);
        led3State = "on";
        updateServerDeviceState("led3", true);  
    } else if (light >= thresholds.lightThreshold && led3State != "off") {
        digitalWrite(led3, LOW);
        led3State = "off";
        updateServerDeviceState("led3", false);  
    }
}
void handleSensorData() {
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    int light = analogRead(LIGHT_SENSOR_PIN);
    float moisturePercent = getMoisturePercent();
  \
    // Debug print
    Serial.println("Sensor readings:");
    Serial.print("Temperature: ");
    Serial.println(temperature);
    Serial.print("Humidity: ");
    Serial.println(humidity);
    Serial.print("Light: ");
    Serial.println(light);
    Serial.print("Moisture: ");
    Serial.println(moisturePercent);
    DynamicJsonDocument doc(1024);
    doc["temperature"] = isnan(temperature) ? 0 : temperature;
    doc["humidity"] = isnan(humidity) ? 0 : humidity;
    doc["light"] = map(light, 4095, 0, 0, 1000);
    doc["moisture"] = moisturePercent;
    String jsonString;
    serializeJson(doc, jsonString);
   Serial.println("JSON response:");
    Serial.println(jsonString);

    // Thêm tiêu đề CORS
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", jsonString);
}

void handleLEDData() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");

    if (server.method() == HTTP_OPTIONS) {
        server.send(204);
        return;
    }
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, body);
        
        if (error) {
            server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
            return;
        }

        const char* ledId = doc["ledId"];
        const char* state = doc["state"];

        // Xử lý ledId dạng "led1", "led2", "led3"
        char ledNum = ledId[3]; // Lấy số từ "led1"
        
        switch(ledNum) {
            case '1':
                digitalWrite(led1, strcmp(state, "on") == 0 ? HIGH : LOW);
                led1State = state;
                break;
            case '2':
                digitalWrite(led2, strcmp(state, "on") == 0 ? HIGH : LOW);
                led2State = state;
                break;
            case '3':
                digitalWrite(led3, strcmp(state, "on") == 0 ? HIGH : LOW);
                led3State = state;
                break;
            default:
                server.send(400, "application/json", "{\"error\":\"Invalid LED ID\"}");
                return;
        }

        String response = "{\"message\":\"" + String(ledId) + " is " + state + "\"}";
        server.send(200, "application/json", response);
    } else {
        server.send(400, "application/json", "{\"error\":\"No data received\"}");
    }
}

void handleAwningStatus() {
    DynamicJsonDocument doc(1024);
    doc["isExtended"] = awningExtended;
    doc["isRetracted"] = awningRetracted;
    doc["isMoving"] = isMoving;

    String jsonString;
    serializeJson(doc, jsonString);

    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", jsonString);
}
void handleAwningControl() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");

    if (server.method() == HTTP_OPTIONS) {
        server.send(204);
        return;
    }

    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, body);

        if (error) {
            server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
            return;
        }

        const char* action = doc["action"];

        // Only proceed if not currently moving
        if (!isMoving) {
          if (strcmp(action, "extend") == 0) {
        motor_1_Tien(MAX_SPEED);
        awningStartTime = millis();
        lastAwningCommand = millis(); // Ghi nhận thời điểm ra lệnh
        isMoving = true;
        awningExtended = true;
        awningRetracted = false;
        server.send(200, "application/json", "{\"message\":\"Awning extending\", \"success\":true}");
    } 
    else if (strcmp(action, "retract") == 0) {
        motor_1_Lui(MAX_SPEED);
        awningStartTime = millis();
        lastAwningCommand = millis(); // Ghi nhận thời điểm ra lệnh
        isMoving = true;
        awningExtended = false;
        awningRetracted = true;
        server.send(200, "application/json", "{\"message\":\"Awning retracting\", \"success\":true}");
    }
            else {
                server.send(400, "application/json", "{\"error\":\"Invalid action or already in desired state\"}");
            }
        } else {
            server.send(400, "application/json", "{\"error\":\"Awning is currently moving\"}");
        }
    }
}
void handleThresholdUpdate() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    
    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, body);
        
        if (!error) {
            thresholds.autoMode = doc["autoMode"] | false;
            thresholds.tempThreshold = doc["tempThreshold"] | 30.0;
            thresholds.moistureThreshold = doc["moistureThreshold"] | 30.0;
            thresholds.lightThreshold = doc["lightThreshold"] | 300;
            
            server.send(200, "application/json", "{\"success\":true}");
        } else {
            server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
        }
    }
}
void checkScheduledAwning() {
    if (!scheduleSettings.enabled) return;
    
    String currentTime = timeClient.getFormattedTime().substring(0, 5); // Lấy giờ:phút
    
    if (currentTime == scheduleSettings.openTime && !awningExtended) {
        // Mở mái che
        motor_1_Tien(MAX_SPEED);
        awningStartTime = millis();
        lastAwningCommand = millis();
        isMoving = true;
        awningExtended = true;
        awningRetracted = false;
        Serial.println("Auto opening awning based on schedule");
    }
    else if (currentTime == scheduleSettings.closeTime && !awningRetracted) {
        // Đóng mái che
        motor_1_Lui(MAX_SPEED);
        awningStartTime = millis();
        lastAwningCommand = millis();
        isMoving = true;
        awningExtended = false;
        awningRetracted = true;
        Serial.println("Auto closing awning based on schedule");
    }
}
void updateServerDeviceState(const char* ledId, bool state) {
   HTTPClient http; 
    String serverAddress = "http://" + serverIP + ":3000";
    http.begin(serverAddress + "/update-device-state");
    http.addHeader("Content-Type", "application/json");
    
    String payload = "{\"ledId\":\"" + String(ledId) + "\",\"state\":\"" + (state ? "on" : "off") + "\"}";
    int httpResponseCode = http.POST(payload);
    
    if (httpResponseCode > 0) {
        Serial.println("Đã cập nhật trạng thái " + String(ledId) + " lên server");
    } else {
        Serial.println("Lỗi khi cập nhật trạng thái " + String(ledId));
    }
    
    http.end();
}
void handleNotFound() {
    // Thêm tiêu đề CORS
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");

    if (server.method() == HTTP_OPTIONS) {
        server.send(204);
        return;
    }

    server.send(404, "application/json", "{\"error\":\"Not found\"}");
}
