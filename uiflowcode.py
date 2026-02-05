from m5stack import *
from m5stack_ui import *
from uiflow import *
from IoTcloud.AWS import AWS
import wifiCfg
import time
import ntptime
import unit
import json  # Added this for cleaner data handling

# --- Init Screen and Sensors ---
screen = M5Screen()
screen.clean_screen()
screen.set_screen_bg_color(0xFFFFFF)

pir_0 = unit.get(unit.PIR, unit.PORTC)
light_1 = unit.get(unit.LIGHT, unit.PORTB)
Ultrasonic_1 = unit.get(unit.ULTRASONIC, unit.PORTA)

# --- Init Labels ---
label0 = M5Label('Motion sensor', x=55, y=41, color=0x000, font=FONT_MONT_14, parent=None)
label1 = M5Label('Light', x=55, y=73, color=0x000, font=FONT_MONT_14, parent=None)
label2 = M5Label('Ultrasonic', x=55, y=100, color=0x000, font=FONT_MONT_14, parent=None)
label3 = M5Label('Time', x=55, y=132, color=0x000, font=FONT_MONT_14, parent=None)
status_label = M5Label('Status: ON', x=55, y=10, color=0x00AA00, font=FONT_MONT_14, parent=None) # New label for status

# --- Global Variables ---
system_on = True  # Default to ON so it works immediately

# --- WiFi Connection ---
wifiCfg.doConnect('SillyGoose', 'monyet123')
while not (wifiCfg.wlan_sta.isconnected()):
    wait(1)
    print('Connecting..')

# --- AWS Shadow Callback (The Listener) ---
def fun__aws_things_maxguard_ting_shadow_update_delta_(topic_data):
    global system_on
    try:
        print("Received Shadow Update:", topic_data)
        # Parse the incoming JSON message
        payload = json.loads(topic_data)
        
        # Check if "power" is inside the "state" object
        if 'state' in payload and 'power' in payload['state']:
            new_state = payload['state']['power']
            
            # Update the global variable
            system_on = new_state
            
            # Update the status label immediately
            if system_on:
                status_label.set_text("Status: ON")
                status_label.set_text_color(0x00AA00) # Green
            else:
                status_label.set_text("Status: PAUSED")
                status_label.set_text_color(0xFF0000) # Red
                screen.set_screen_bg_color(0xFFFFFF) # Reset BG just in case
                
    except Exception as e:
        print("Error parsing JSON:", e)

# --- AWS Setup ---
aws = AWS(things_name='maxguard_ting', 
          host='adq3zf94hcaqm-ats.iot.ap-southeast-1.amazonaws.com', 
          port=8883, 
          keepalive=60, 
          cert_file_path="/flash/res/certificate.crt", 
          private_key_path="/flash/res/private.key")

# Subscribe to the Shadow Delta (Listen for changes)
aws.subscribe(str('$aws/things/maxguard_ting/shadow/update/delta'), fun__aws_things_maxguard_ting_shadow_update_delta_)
aws.start()

# --- Main Loop ---
while wifiCfg.wlan_sta.isconnected():
    try:
        # 1. THE GATE: Only run if system_on is True
        if system_on:
            import ntptime
            ntp = ntptime.client(host='pool.ntp.org', timezone=8)
            
            # Read Values
            dist_val = Ultrasonic_1.distance
            light_val = light_1.analogValue
            motion_val = pir_0.state
            timestamp = ntp.getTimestamp()

            # Update Screen
            label0.set_text(str(motion_val))
            label1.set_text(str(light_val))
            label2.set_text(str(dist_val))
            label3.set_text(str(timestamp))

            # Create clean JSON dictionary
            data_packet = {
                "device_id": 1,
                "distance": dist_val,
                "light_level": light_val,
                "motion_detected": motion_val,
                "timestamp": timestamp
            }
            
            # Publish cleanly using json.dumps
            aws.publish('topic_1', json.dumps(data_packet))
            
        else:
            # If PAUSED, just clear the values or show "---"
            label0.set_text("---")
            label1.set_text("---")
            label2.set_text("---")
            # We don't publish anything here, saving data/processing
            
    except Exception as e:
        print("Loop Error:", e)

    wait(2)
