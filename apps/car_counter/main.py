import base64
import datetime
import json
import locale
import socket
import sys
import threading
import time
from collections import defaultdict
from pathlib import Path

import cv2
import eel
import imutils 
import traceback
import numpy as np
import pandas as pd
import tkinter as tk
from tkinter import filedialog
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))
from libs.camera import Camera

# Temel Ayarlar ve Global Değişkenler
eel.init(str(Path(__file__).parent / 'web'))


APP_STATE = {
    "workStatus": False,
    "video_capture": None,
    "current_frame_processed": None, # İşlenmiş son kare (base64 string)
    "selected_source_type": "camera", # "camera" veya "video"
    "selected_source_path": "0",      # Kamera indeksi veya video dosya yolu
    "selected_konum_file": None,      # Seçili koordinat/alan JSON dosyası
    "coord_json_data": None,          # Yüklenmiş koordinat verisi
    "track_history": defaultdict(lambda: []),
    "inside_list": [],
    "frame_count_for_video": 0, # Sadece video dosyası işlenirken kullanılır
    "fps": 0.0,
    "last_frame_time": time.time(),
    # Sayaçlar
    "area_counts": {},
    # Alan tanımlama için
    "line_creator_active": False,
    "line_creator_base_frame": None, # Üzerine çizim yapılacak orijinal kare
    "line_creator_display_frame": None, # Arayüze gönderilecek çizimli kare (base64)
    "line_creator_points": [],
    "line_creator_konum_file_path": None, # Hangi JSON dosyasına kaydedileceği
    "line_creator_new_section_name": None,
    "overall_total_counter": 0, # Genel sayaç 
}


# Model Yükleme
MODEL_PATH = Path(__file__).parent.parent.parent / "models" / "yolov11n.pt"
YOLO_MODEL = None

# Load the YOLO model
try:
    if MODEL_PATH.exists():
        YOLO_MODEL = YOLO(MODEL_PATH)
        print(f"YOLO model loaded from {MODEL_PATH}")
    else:
        print(f"Warning: YOLO model not found at {MODEL_PATH}")
except Exception as e:
    print(f"Error loading YOLO model: {e}")


# --- Yardımcı Path Fonksiyonları ---
script_directory = Path(__file__).parent.parent.parent
sections_path = script_directory / "inputs" / "car_counter" / "sections"
sections_path.mkdir(parents=True, exist_ok=True)
records_path = script_directory / "inputs" / "car_counter" / "records"
records_path.mkdir(parents=True, exist_ok=True)
output_path = script_directory / "outputs" / "car_counter"
output_path.mkdir(parents=True, exist_ok=True)
models_path = script_directory / "models"
models_path.mkdir(parents=True, exist_ok=True)


@eel.expose
def find_camera_devices():
    available_cameras = []
    for i in range(5): # Genellikle ilk birkaç indekste kamera bulunur
        cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
        if cap.isOpened():
            is_read, _ = cap.read()
            if is_read:
                available_cameras.append(i)
            cap.release()
    return available_cameras


@eel.expose
def request_video_file_path():
    # Bu fonksiyon Tkinter kullandığı için ana thread'de çalıştırılması gerekebilir.
    # Eel genellikle bunu kendi yönetir.
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        file_path = filedialog.askopenfilename(
            title="Video Dosyası Seçiniz",
            filetypes=(("Video Dosyaları", "*.mp4 *.avi *.mov *.mkv"), ("Tüm Dosyalar", "*.*"))
        )
        root.destroy()
        return file_path if file_path else ""
    except Exception as e:
        print(f"Tkinter dosya dialog hatası: {e}")
        return ""


@eel.expose
def get_konum_listesi():
    return [f.stem for f in sections_path.iterdir() if f.is_file() and f.suffix == '.json']

@eel.expose
def start_video_processing(settings):
    global APP_STATE, YOLO_MODEL

    if APP_STATE["workStatus"]:
        return {"status": "warning", "message": "Analiz zaten çalışıyor."}
    if YOLO_MODEL is None:
        return {"status": "error", "message": f"YOLO modeli yüklenemedi ({MODEL_PATH}). Lütfen kontrol edin."}

    APP_STATE["selected_source_type"] = settings.get("sourceType", "camera")
    APP_STATE["selected_source_path"] = settings.get("sourcePath", "0")
    APP_STATE["selected_konum_file"] = settings.get("secilenKonumFile")

    if hasattr(YOLO_MODEL, 'predictor'):
        YOLO_MODEL.predictor = None 
        print("YOLO Predictor/Tracker bir sonraki kullanım için sıfırlandı.")
    
    if not APP_STATE["selected_konum_file"]:
        return {"status": "error", "message": "Lütfen bir konum (alanlar) dosyası seçiniz."}
    
    konum_file_path = sections_path / f"{APP_STATE['selected_konum_file']}.json"
    if not konum_file_path.exists():
        return {"status": "error", "message": f"Konum dosyası bulunamadı: {konum_file_path}"}
    
    

    try:
        with open(konum_file_path, "r", encoding="utf-8") as f:
            APP_STATE["coord_json_data"] = json.load(f)
        print(f"Yüklenen Konum Verisi ({APP_STATE['selected_konum_file']}): {APP_STATE['coord_json_data']}")
        APP_STATE["area_counts"] = {}
        APP_STATE["inside_list_area_specific"] = {}
        if APP_STATE["coord_json_data"] and isinstance(APP_STATE["coord_json_data"], dict):
            for area_name in APP_STATE["coord_json_data"].keys():
                APP_STATE["area_counts"][area_name] = {
                    "total": 0, "car": 0, "bus": 0, "truck": 0,
                    "motorcycle": 0, "person": 0, "tir": 0, "ambulans": 0, "minibus": 0 
                }
                APP_STATE["inside_list_area_specific"][area_name] = []
        print(f"Başlangıç Alan Sayaçları: {APP_STATE['area_counts']}")
    except Exception as e:
        return {"status": "error", "message": f"Konum dosyası okunamadı veya işlenemedi: {e}"}

    APP_STATE["overall_total_counter"] = 0
    APP_STATE["frame_count_for_video"] = 0
    APP_STATE["track_history"] = defaultdict(lambda: [])
    APP_STATE["last_frame_time"] = time.time()
    APP_STATE["fps"] = 0.0
    
    source_to_open = APP_STATE["selected_source_path"]
    if APP_STATE["selected_source_type"] == "camera":
        try:
            source_to_open = int(APP_STATE["selected_source_path"])
        except ValueError:
            return {"status": "error", "message": "Geçersiz kamera indeksi."}
    # IP Kamera (RTSP) veya Video Dosyası için source_to_open zaten string (URL veya dosya yolu)
    
    print(f"Görüntü kaynağı açılıyor: Tip='{APP_STATE['selected_source_type']}', Kaynak='{source_to_open}'")
    APP_STATE["video_capture"] = cv2.VideoCapture(source_to_open)
    
    if not APP_STATE["video_capture"].isOpened():
        return {"status": "error", "message": f"Görüntü kaynağı ({source_to_open}) açılamadı. URL/dosya yolu doğru mu ve ağ bağlantısı var mı kontrol edin."}

    APP_STATE["workStatus"] = True
    threading.Thread(target=capture_loop, daemon=True).start()
    return {"status": "success", "message": "Analiz başlatıldı."}


@eel.expose
def stop_video_processing():
    global APP_STATE
    APP_STATE["workStatus"] = False
    # capture_loop thread'i workStatus'u kontrol ederek kendi kendine duracak.
    # video_capture kaynağı capture_loop sonunda serbest bırakılacak.
    print("Video işleme durdurma komutu alındı.")
    return {"status": "success", "message": "Analiz durduruluyor..."}


@eel.expose
def get_current_counts_and_fps():
    # JavaScript'e hem alan bazlı sayaçları hem de genel FPS'i gönder
    return {
        "area_counts": APP_STATE["area_counts"],
        "overall_total": APP_STATE["overall_total_counter"], # Genel toplamı da gönderelim
        "fps": round(APP_STATE.get("fps", 0.0), 1)
    }
        

def capture_loop():
    global APP_STATE
    try:
        locale.setlocale(locale.LC_ALL, '') # Tarih/saat formatları için
    except locale.Error:
        print("Uyarı: Sistem lokal ayarları yapılamadı, varsayılan kullanılacak.")

    while APP_STATE["workStatus"]:
        if APP_STATE["video_capture"] is None or not APP_STATE["video_capture"].isOpened():
            APP_STATE["workStatus"] = False
            break

        ret, frame = APP_STATE["video_capture"].read()
        if not ret or frame is None:
            print("Video karesi okunamadı veya video/kamera sonlandı.")
            APP_STATE["workStatus"] = False
            eel.show_message_js("Video kaynağı sonlandı veya kare okunamadı.", "error") # type: ignore
            break
        
        if APP_STATE["selected_source_type"] == "video":
            APP_STATE["frame_count_for_video"] += 1

        processed_output_frame = process_single_frame(frame.copy())

        if processed_output_frame is not None:
            try:
                # Arayüz için kareyi yeniden boyutlandırabiliriz (isteğe bağlı)
                # display_frame = imutils.resize(processed_output_frame, width=800) 
                display_frame = processed_output_frame # Şimdilik orijinal boyut
                
                _, buffer = cv2.imencode('.jpg', display_frame)
                APP_STATE["current_frame_processed"] = base64.b64encode(buffer.tobytes()).decode('utf-8')
                eel.update_video_frame_js(APP_STATE["current_frame_processed"]) # type: ignore
                eel.update_counts_js(get_current_counts_and_fps()) # type: ignore
            except Exception as e:
                print(f"Hata (capture_loop - frame encode/send): {e}")
        
        # CPU'yu yormamak için çok kısa bir bekleme (isteğe bağlı, akış hızına göre ayarlanır)
        eel.sleep(0.001) # Örneğin 1ms

    if APP_STATE["video_capture"] is not None:
        APP_STATE["video_capture"].release()
        APP_STATE["video_capture"] = None
        print("Video kaynağı serbest bırakıldı.")
    
    APP_STATE["workStatus"] = False # Döngü bitince durumu kesin olarak false yap
    # Son bir kez arayüzü bilgilendir (örn: FPS'i sıfırla, video alanını temizle)
    eel.update_counts_js(get_current_counts_and_fps()) # type: ignore # FPS sıfırlanmış olabilir
    # eel.clear_video_frame_js() # JS tarafında böyle bir fonksiyon oluşturulabilir


def process_single_frame(original_frame):
    global APP_STATE, YOLO_MODEL # APP_STATE ve YOLO_MODEL global olarak kullanılacak

    # YOLO modeli yüklü mü kontrol et
    if YOLO_MODEL is None:
        print("process_single_frame: YOLO modeli yüklenemedi. Lütfen modeli kontrol edin.")
        return None

    if original_frame is None:
        print("process_single_frame: Boş frame alındı, işleme atlanıyor.")
        return None # veya return original_frame
    
    output_frame = original_frame.copy() # Çizimler bu kopya üzerine yapılacak

    # FPS Hesaplama
    now = time.time()
    time_diff = now - APP_STATE.get("last_frame_time", now) # .get ile anahtar yoksa hata almayı önle
    APP_STATE["fps"] = (1.0 / time_diff) if time_diff > 0 else APP_STATE.get("fps", 0.0)
    APP_STATE["last_frame_time"] = now

    # YOLO ile nesne tespiti ve takibi
    # conf=0.25: Güven skoru %25'in üzerinde olanları al. İhtiyaca göre ayarlanabilir.
    # classes=None: Tüm COCO sınıflarını algılar. Sadece araçlar için [2,3,5,7] gibi bir liste verilebilir.
    results = YOLO_MODEL.track(original_frame, persist=True, verbose=False, classes=None, tracker="bytetrack.yaml", conf=0.25)
    
    print("--- YENI KARE ---") # Her kare işlendiğinde logla (isteğe bağlı)
    if results and results[0] and results[0].boxes is not None:
        boxes = results[0].boxes  # ultralytics.engine.results.Boxes nesnesi
        
        # Sadece hata ayıklama için: tespit edilen kutu sayısını yazdır
        print(f"Algılanan Kutu Sayısı (Boxes objesinden): {len(boxes)}")

        for i in range(len(boxes)):
            box = boxes[i]  # Tek bir kutu (detection)
            
            # Koordinatları al (float olarak alıp sonra int'e çevir)
            xyxy_tensor = box.xyxy[0].cpu()
            x1, y1, x2, y2 = map(int, xyxy_tensor.tolist())
            
            score = float(box.conf[0].cpu())
            class_id = int(box.cls[0].cpu())
            
            track_id = -1 # Varsayılan: Takip ID'si yok
            if box.id is not None: # Takip ID'si var mı kontrol et (tracker="bytetrack.yaml" ile olmalı)
                track_id = int(box.id[0].cpu())
            
            # Güven skoru düşük olanları atla (bu eşiği ayarlayabilirsiniz)
            if score < 0.25: 
                # print(f"      Track ID {track_id} atlandı: Düşük güven skoru ({score:.2f})")
                continue 

            center_x = int((x1 + x2) / 2)
            center_y = int((y1 + y2) / 2)
            class_name_from_model = YOLO_MODEL.names.get(class_id, f"ID_{class_id}")
            
            # print(f"  İşleniyor: Track ID: {track_id}, Sınıf: {class_name_from_model} ({class_id}), Güven: {score:.2f}, Merkez: ({center_x},{center_y})")

            track_points = APP_STATE["track_history"][track_id]
            track_points.append((center_x, center_y))
            if len(track_points) > 20: # Takip geçmişi uzunluğu
                track_points.pop(0)
            FONT_FACE = cv2.FONT_HERSHEY_SIMPLEX

            # Renk ve Çizimler
            color = (0, 255, 0) # Varsayılan yeşil
            if class_name_from_model == "car":
                color = (255, 0, 0) 
            elif class_name_from_model == "person":
                color = (0, 0, 255)
            elif class_name_from_model == "bus":
                color = (0, 165, 255) 
            elif class_name_from_model == "truck":
                color = (128, 0, 128)
            elif class_name_from_model == "motorcycle":
                color = (255, 192, 203)

            cv2.rectangle(output_frame, (x1, y1), (x2, y2), color, 2)
            label_text = f"ID:{track_id} {class_name_from_model} S:{score:.2f}"
            cv2.putText(output_frame, label_text, (x1, y1 - 7), FONT_FACE, 0.5, color, 2)
            
            if len(track_points) > 1:
                pts_np = np.array(track_points, np.int32).reshape((-1,1,2))
                cv2.polylines(output_frame, [pts_np], isClosed=False, color=color, thickness=2)

            # Alan Kontrolü ve ALAN BAZLI SAYMA
            if APP_STATE["coord_json_data"] and isinstance(APP_STATE["coord_json_data"], dict):
                for section_name, section_coords_list in APP_STATE["coord_json_data"].items():
                    if not isinstance(section_coords_list, list) or not all(isinstance(p, list) and len(p) == 2 for p in section_coords_list):
                        # Bu alan için format hatası varsa atla (önceki loglarda bu uyarı vardı, şimdi sessizce atlıyoruz)
                        # print(f"        Hatalı koordinat formatı: Alan '{section_name}'") # İsterseniz bu logu açabilirsiniz
                        continue

                    polygon_points = np.array(section_coords_list, np.int32).reshape((-1,1,2))
                    # Tanımlı sayım alanlarını video üzerine çiz (her karede)
                    cv2.polylines(output_frame, [polygon_points], isClosed=True, color=(255,255,0), thickness=2) 

                    is_inside = cv2.pointPolygonTest(polygon_points, (center_x, center_y), False)
                    
                    if is_inside >= 0: # Nesne alanın içinde veya kenarında
                        # O alana özel inside_list'i al veya oluştur
                        if section_name not in APP_STATE["inside_list_area_specific"]:
                            APP_STATE["inside_list_area_specific"][section_name] = []
                        
                        current_area_inside_list = APP_STATE["inside_list_area_specific"][section_name]

                        if track_id not in current_area_inside_list:
                            # print(f"    SAYIM: Nesne ID {track_id} ({class_name_from_model}), '{section_name}' alanına girdi.")
                            
                            # Alan bazlı sayaçları başlat (eğer o alan için daha önce hiç sayım yapılmadıysa)
                            if section_name not in APP_STATE["area_counts"]:
                                APP_STATE["area_counts"][section_name] = {
                                    "total": 0, "car": 0, "bus": 0, "truck": 0,
                                    "motorcycle": 0, "person": 0, "tir": 0, "ambulans": 0, "minibus": 0
                                }
                            
                            APP_STATE["area_counts"][section_name]["total"] += 1
                            APP_STATE["overall_total_counter"] += 1 
                            current_area_inside_list.append(track_id) 

                            # Sınıfa göre o alanın sayacını artır
                            if class_name_from_model == "car":
                                APP_STATE["area_counts"][section_name]["car"] += 1
                            elif class_name_from_model == "bus":
                                APP_STATE["area_counts"][section_name]["bus"] += 1
                                # Minibüs için bir çıkarım (örnek, boyut vs. ile geliştirilebilir)
                                # w, h = x2-x1, y2-y1 (if w*h < threshold_for_bus: APP_STATE["area_counts"][section_name]["minibus"] +=1)
                            elif class_name_from_model == "truck":
                                APP_STATE["area_counts"][section_name]["truck"] += 1
                                # Tır için bir çıkarım (örnek, boyut vs. ile geliştirilebilir)
                                # w, h = x2-x1, y2-y1 (if w*h > threshold_for_truck: APP_STATE["area_counts"][section_name]["tir"] +=1)
                            elif class_name_from_model == "motorcycle":
                                APP_STATE["area_counts"][section_name]["motorcycle"] += 1
                            elif class_name_from_model == "person":
                                APP_STATE["area_counts"][section_name]["person"] += 1
                            
                            # print(f"      GÜNCEL SAYAÇLAR ({section_name}): {APP_STATE['area_counts'][section_name]}")
                            # print(f"      GÜNCEL GENEL TOPLAM: {APP_STATE['overall_total_counter']}")
                            
                            timestamp = datetime.datetime.now()
                            record_data = {
                                "tarih_saat": timestamp.strftime("%Y-%m-%d %H:%M:%S"), "yil": timestamp.year, 
                                "ay_no": timestamp.month, "ay_adi": timestamp.strftime('%B'), "gun_no": timestamp.day, 
                                "gun_adi": timestamp.strftime('%A'), "saat": timestamp.hour, 
                                "dakika": timestamp.minute, "saniye": timestamp.second,
                                "konum_dosyasi": APP_STATE["selected_konum_file"], 
                                "alan_ismi": section_name,
                                "tasit_tipi": class_name_from_model,
                                "track_id": track_id, # Takip ID'sini de loglayabiliriz
                                "video_frame_no": APP_STATE["frame_count_for_video"] if APP_STATE["selected_source_type"] == "video" else "-"
                            }
                            append_to_log_csv(record_data)
            # Alan verisi yoksa her karede bir kez uyarı ver (çok fazla log olmasın diye)
            elif i == 0 and not APP_STATE["coord_json_data"] : 
                print("      UYARI: Tanımlı sayım alanı (coord_json_data) bulunamadı veya boş. Alan bazlı sayım yapılamıyor.")
    else:
        # print("Bu karede işlenecek kutu bulunamadı.") # Bu log çok sık çıkabilir, isteğe bağlı
        pass
    
    return output_frame


def append_to_log_csv(log_data):
    log_file = records_path / "arac_gecis_loglari.csv"
    columns_order = [
        "tarih_saat", "yil", "ay_no", "ay_adi", "gun_no", "gun_adi", 
        "saat", "dakika", "saniye", "konum_dosyasi", "alan_ismi", 
        "tasit_tipi", "track_id", "video_frame_no"
    ]
    # Gelen log_data'yı bu sıraya göre düzenleyelim
    # Eksik anahtar varsa None veya boş string ile doldurabiliriz
    ordered_log_data = {key: log_data.get(key, "") for key in columns_order}

    df_new = pd.DataFrame([ordered_log_data], columns=columns_order) # Sütun sırasını belirt
    
    try:
        if not log_file.exists():
            df_new.to_csv(log_file, index=False, encoding='utf-8-sig', header=True) # Excel'de Türkçe karakterler için utf-8-sig
        else:
            df_new.to_csv(log_file, mode='a', header=False, index=False, encoding='utf-8-sig')
    except Exception as e:
        print(f"CSV log yazma hatası: {e}")


@eel.expose
def start_line_creator_mode(settings):
    global APP_STATE
    # settings = { "konumSecimiTipi": "mevcut" veya "yeni",
    #              "mevcutKonum": "dosya_adi_stem", (eğer mevcut ise)
    #              "yeniKonumIsmi": "yeni_dosya_adi", (eğer yeni ise)
    #              "alanIsmiEntry": "tanimlanacak_alan_adi" }

    if APP_STATE["line_creator_active"]:
        return {"status": "warning", "message": "Alan tanımlama modu zaten aktif."}

    konum_secimi_tipi = settings.get("konumSecimiTipi")
    yeni_alan_ismi = settings.get("alanIsmiEntry")

    if not yeni_alan_ismi:
        return {"status": "error", "message": "Lütfen tanımlanacak alan için bir isim girin."}

    target_konum_file_stem = ""
    if konum_secimi_tipi == "mevcut":
        target_konum_file_stem = settings.get("mevcutKonum")
        if not target_konum_file_stem:
            return {"status": "error", "message": "Mevcut bir konum dosyası seçilmedi."}
    elif konum_secimi_tipi == "yeni":
        target_konum_file_stem = settings.get("yeniKonumIsmi")
        if not target_konum_file_stem:
            return {"status": "error", "message": "Yeni konum dosyası için bir isim girilmedi."}
        # Yeni JSON dosyası oluştur (içi boş obje ile)
        new_file_path = sections_path / f"{target_konum_file_stem}.json"
        try:
            with open(new_file_path, "w", encoding="utf-8") as f:
                json.dump({}, f)
            print(f"Yeni konum dosyası oluşturuldu: {new_file_path}")
        except Exception as e:
            return {"status": "error", "message": f"Yeni konum dosyası oluşturulamadı: {e}"}
    else:
        return {"status": "error", "message": "Geçersiz konum seçimi tipi."}

    APP_STATE["line_creator_konum_file_path"] = sections_path / f"{target_konum_file_stem}.json"
    APP_STATE["line_creator_new_section_name"] = yeni_alan_ismi

    # Örnek bir kare al (aktif video/kamera kaynağından veya belirtilen bir kaynaktan)
    # Şimdilik, eğer video zaten çalışıyorsa onun son karesini kullanalım,
    # değilse, kullanıcının ayarlardan bir kaynak seçmiş olması beklenir.
    source_for_frame = APP_STATE["selected_source_path"]
    if APP_STATE["selected_source_type"] == "camera":
        try:
            source_for_frame = int(APP_STATE["selected_source_path"])
        except Exception:
            source_for_frame = 0 # Varsayılan kamera
    
    temp_cap = cv2.VideoCapture(source_for_frame)
    if not temp_cap.isOpened():
        return {"status": "error", "message": f"Alan tanımlama için örnek kare alınamadı (Kaynak: {source_for_frame}). Lütfen ayarlardan geçerli bir kaynak seçin."}
    
    ret, frame = temp_cap.read()
    temp_cap.release()
    if not ret or frame is None:
        return {"status": "error", "message": "Alan tanımlama için örnek kare okunamadı."}

    APP_STATE["line_creator_base_frame"] = frame.copy()
    APP_STATE["line_creator_points"] = []
    APP_STATE["line_creator_active"] = True
    
    # İlk boş çizim karesini gönder
    display_line_creator_frame_to_js()
    return {"status": "success", "message": "Alan tanımlama modu aktif. Lütfen görüntü üzerine 4 nokta seçin."}


def display_line_creator_frame_to_js():
    global APP_STATE
    if APP_STATE["line_creator_base_frame"] is None or not APP_STATE["line_creator_active"]:
        return

    # Üzerine çizim yapılacak geçici bir kopya oluştur
    display_img = APP_STATE["line_creator_base_frame"].copy()
    display_img = imutils.resize(display_img, width=640) # Arayüzde gösterim için boyutlandır

    # Mevcut noktaları çiz
    for i, point_orig_coords in enumerate(APP_STATE["line_creator_points"]):
        # Orijinal koordinatları, gösterilen resim boyutuna ölçekle (yaklaşık)
        scale_x = display_img.shape[1] / APP_STATE["line_creator_base_frame"].shape[1]
        scale_y = display_img.shape[0] / APP_STATE["line_creator_base_frame"].shape[0]
        FONT_FACE = cv2.FONT_HERSHEY_SIMPLEX
        display_x = int(point_orig_coords[0] * scale_x)
        display_y = int(point_orig_coords[1] * scale_y)
        cv2.circle(display_img, (display_x, display_y), 5, (0, 255, 0), -1)
        cv2.putText(display_img, str(i+1), (display_x + 5, display_y - 5), FONT_FACE, 0.7, (255,255,0), 2)

    # Eğer 4 nokta varsa, poligonu da çiz (gösterilen resim üzerinde)
    if len(APP_STATE["line_creator_points"]) == 4:
        scaled_points = []
        for p_orig in APP_STATE["line_creator_points"]:
            scaled_x = int(p_orig[0] * scale_x)
            scaled_y = int(p_orig[1] * scale_y)
            scaled_points.append([scaled_x, scaled_y])
        
        pts_np = np.array(scaled_points, np.int32).reshape((-1,1,2))
        cv2.polylines(display_img, [pts_np], isClosed=True, color=(0,0,255), thickness=2)
    
    _, buffer = cv2.imencode('.jpg', display_img)
    APP_STATE["line_creator_display_frame"] = base64.b64encode(buffer.tobytes()).decode('utf-8')
    eel.update_line_creator_feed_js(APP_STATE["line_creator_display_frame"]) # type: ignore


@eel.expose
def line_creator_add_point(click_x, click_y, display_width, display_height):
    global APP_STATE
    if not APP_STATE["line_creator_active"] or APP_STATE["line_creator_base_frame"] is None:
        return {"status": "error", "message": "Alan tanımlama modu aktif değil."}
    if len(APP_STATE["line_creator_points"]) >= 4:
        return {"status": "warning", "message": "En fazla 4 nokta seçebilirsiniz."}

    # Tıklanan koordinatları (gösterilen resim üzerindeki) orijinal kare boyutuna ölçekle
    orig_frame_h, orig_frame_w = APP_STATE["line_creator_base_frame"].shape[:2]
    
    original_x = int((click_x / display_width) * orig_frame_w)
    original_y = int((click_y / display_height) * orig_frame_h)
    
    APP_STATE["line_creator_points"].append([original_x, original_y])
    display_line_creator_frame_to_js() # Çizimli kareyi JS'e gönder
    return {"status": "success"}

@eel.expose
def line_creator_undo_last_point():
    global APP_STATE
    if APP_STATE["line_creator_active"] and APP_STATE["line_creator_points"]:
        APP_STATE["line_creator_points"].pop()
        display_line_creator_frame_to_js()
    return {"status": "success"}


@eel.expose
def line_creator_save_and_exit():
    global APP_STATE
    if not APP_STATE["line_creator_active"]:
        return {"status": "error", "message": "Alan tanımlama modu aktif değil."}
    if len(APP_STATE["line_creator_points"]) != 4:
        return {"status": "warning", "message": "Lütfen tam olarak 4 nokta seçin."}
    if not APP_STATE["line_creator_konum_file_path"] or not APP_STATE["line_creator_new_section_name"]:
        return {"status": "error", "message": "Konum dosyası yolu veya yeni alan adı ayarlanmamış."}

    try:
        json_data = {}
        # JSON dosyasını oku (eğer varsa)
        if APP_STATE["line_creator_konum_file_path"].exists():
            with open(APP_STATE["line_creator_konum_file_path"], "r", encoding="utf-8") as f:
                try:
                    json_data = json.load(f)
                    if not isinstance(json_data, dict): # Eğer dosya içeriği bir sözlük değilse, boş bir sözlükle başla
                        print(f"Uyarı: {APP_STATE['line_creator_konum_file_path'].name} içeriği geçerli bir JSON sözlüğü değil, sıfırlanıyor.")
                        json_data = {}
                except json.JSONDecodeError: 
                    print(f"Uyarı: {APP_STATE['line_creator_konum_file_path'].name} dosyası boş veya bozuk, sıfırlanıyor.")
                    json_data = {} 
        
        # Yeni alanı (orijinal koordinatlarla) ekle/güncelle
        json_data[APP_STATE["line_creator_new_section_name"]] = APP_STATE["line_creator_points"]
        
        # JSON dosyasına yaz
        with open(APP_STATE["line_creator_konum_file_path"], "w", encoding="utf-8") as f:
            json.dump(json_data, f, indent=4)
        
        message = f"'{APP_STATE['line_creator_new_section_name']}' alanı '{APP_STATE['line_creator_konum_file_path'].name}' dosyasına başarıyla kaydedildi."
        
        # Alan tanımlama modunu ve ilgili state'leri temizle
        
        APP_STATE["line_creator_active"] = False
        APP_STATE["line_creator_base_frame"] = None
        APP_STATE["line_creator_display_frame"] = None
        APP_STATE["line_creator_points"] = []
        # APP_STATE["line_creator_konum_file_path"] = None # Bu kalsın, JS'de hangi dosyanın güncellendiği bilinebilir
        # APP_STATE["line_creator_new_section_name"] = None # Bu da kalsın
        
        eel.update_line_creator_feed_js(None) # type: ignore # JS tarafındaki çizim görüntüsünü temizle
            
        # Başarılı sonucu ve güncel konum listesini JavaScript'e döndür
        return {
            "status": "success", 
            "message": message, 
            "new_konum_listesi": get_konum_listesi(), # Güncel konum dosyası listesi
            "updated_konum_file": APP_STATE["line_creator_konum_file_path"].stem # Hangi konum dosyasının güncellendiği
        }
    except Exception as e:
        print(f"line_creator_save_and_exit içinde hata: {e}")
        traceback.print_exc() # Detaylı hata logu için
        return {"status": "error", "message": f"Alan kaydedilemedi: {e}"}


@eel.expose
def line_creator_cancel():
    global APP_STATE
    APP_STATE["line_creator_active"] = False
    APP_STATE["line_creator_base_frame"] = None
    APP_STATE["line_creator_display_frame"] = None
    APP_STATE["line_creator_points"] = []
    APP_STATE["line_creator_konum_file_path"] = None
    APP_STATE["line_creator_new_section_name"] = None
    eel.update_line_creator_feed_js(None) # type: ignore # JS tarafındaki görüntüyü temizle
    return {"status": "info", "message": "Alan tanımlama iptal edildi."}


@eel.expose
def get_section_details(konum_file_stem):
    if not konum_file_stem:
        return {}

    file_path = sections_path / f"{konum_file_stem}.json"
    if file_path.exists():
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


@eel.expose
def delete_section_from_file(konum_file_stem, section_name_to_delete):
    if not konum_file_stem or not section_name_to_delete:
        return {"status": "error", "message": "Konum veya alan adı belirtilmedi."}
    
    file_path = sections_path / f"{konum_file_stem}.json"
    if not file_path.exists():
        return {"status": "error", "message": "Konum dosyası bulunamadı."}
        
    try:
        with open(file_path, "r+", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                return {"status": "error", "message": "Konum dosyası bozuk veya boş."}
            
            if section_name_to_delete in data:
                del data[section_name_to_delete]
                f.seek(0)
                f.truncate()
                json.dump(data, f, indent=4)
                return {"status": "success", "message": f"'{section_name_to_delete}' alanı '{konum_file_stem}' konumundan silindi."}
            else:
                return {"status": "warning", "message": f"'{section_name_to_delete}' alanı bulunamadı."}
    except Exception as e:
        return {"status": "error", "message": f"Alan silinemedi: {e}"}


# --- Veri Analizi Fonksiyonları ---
@eel.expose
def perform_data_analysis(date_filters):
    try:
        log_file_path = records_path / "arac_gecis_loglari.csv"
        if not log_file_path.exists():
            return {"status": "error", "message": f"Log dosyası bulunamadı: {log_file_path}"}
        
        df_log_full = pd.read_csv(log_file_path, on_bad_lines='warn')
        if df_log_full.empty:
            return {"status": "info", "message": "Log dosyasında analiz edilecek veri yok."}

        # Tarih/saat dönüşümü ve hata kontrolü
        try:
            df_log_numeric_time = df_log_full[
                pd.to_numeric(df_log_full['saat'], errors='coerce').notnull() &
                pd.to_numeric(df_log_full['dakika'], errors='coerce').notnull() &
                pd.to_numeric(df_log_full['saniye'], errors='coerce').notnull()
            ].copy()
            if df_log_numeric_time.empty:
                 return {"status": "info", "message": "Analiz için uygun zaman damgalı veri bulunamadı."}
            
            required_cols = ['yil', 'ay_no', 'gun_no', 'saat', 'dakika', 'saniye', 'gun_adi', 'konum_dosyasi', 'alan_ismi', 'tasit_tipi']
            if not all(col in df_log_numeric_time.columns for col in required_cols):
                missing_cols = [col for col in required_cols if col not in df_log_numeric_time.columns]
                return {"status": "error", "message": f"Log dosyasında gerekli sütunlar eksik: {', '.join(missing_cols)}"}

            df_log_numeric_time.loc[:, 'datetime_obj'] = pd.to_datetime(
                df_log_numeric_time['yil'].astype(str) + '-' +
                df_log_numeric_time['ay_no'].astype(str) + '-' +
                df_log_numeric_time['gun_no'].astype(str) + ' ' +
                df_log_numeric_time['saat'].astype(str) + ':' +
                df_log_numeric_time['dakika'].astype(str) + ':' +
                df_log_numeric_time['saniye'].astype(str),
                errors='coerce'
            )
            df_log_numeric_time.dropna(subset=['datetime_obj'], inplace=True)
            df_log = df_log_numeric_time.copy()
        except Exception as e:
            print(f"Tarih/saat dönüşüm hatası: {e}")
            return {"status": "error", "message": f"Log dosyasındaki tarih/saat sütunları işlenirken hata: {e}"}

        if df_log.empty:
            return {"status": "info", "message": "Filtreleme için geçerli tarih/saat formatına sahip veri bulunamadı."}

        alt_s = date_filters["altSinir"]
        ust_s = date_filters["ustSinir"]
        dt_alt = datetime.datetime(int(alt_s["year"]), int(alt_s["month"]), int(alt_s["day"]), int(alt_s["hour"] or 0), int(alt_s["minute"] or 0), int(alt_s["second"] or 0))
        dt_ust = datetime.datetime(int(ust_s["year"]), int(ust_s["month"]), int(ust_s["day"]), int(ust_s["hour"] or 23), int(ust_s["minute"] or 59), int(ust_s["second"] or 59))
        
        df_filtered_overall = df_log[(df_log['datetime_obj'] >= dt_alt) & (df_log['datetime_obj'] <= dt_ust)].copy()

        if df_filtered_overall.empty:
            return {"status": "info", "message": "Belirtilen tarih aralığında analiz edilecek veri bulunamadı."}

        # --- Genel Grafik Verilerini Hazırlama ---
        chart_data_overall = {}
        df_filtered_overall.loc[:, 'saat_dilimi'] = df_filtered_overall['datetime_obj'].dt.hour
        saatlik_toplam_genel_data = df_filtered_overall.groupby('saat_dilimi').size().sort_index()
        chart_data_overall['saatlikToplam'] = {
            "labels": saatlik_toplam_genel_data.index.astype(str).tolist(), # Saatleri string yapalım
            "data": saatlik_toplam_genel_data.values.tolist()
        }

        gun_sirasi = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
        df_filtered_overall.loc[:, 'gun_adi_kategorik'] = pd.Categorical(df_filtered_overall['gun_adi'], categories=gun_sirasi, ordered=True)
        gunluk_toplam_genel_data = df_filtered_overall.groupby('gun_adi_kategorik', observed=False).size()
        # gun_sirasi'na göre yeniden indeksleyerek tüm günlerin olmasını sağla (olmayanlar 0 olacak)
        gunluk_toplam_genel_data = gunluk_toplam_genel_data.reindex(gun_sirasi, fill_value=0)
        chart_data_overall['gunlukToplam'] = {
            "labels": gunluk_toplam_genel_data.index.tolist(),
            "data": gunluk_toplam_genel_data.values.tolist()
        }
        
        # --- Alan Bazlı Grafik Verilerini Hazırlama ---
        chart_data_per_area = {}
        grouped_by_area_for_charts = df_filtered_overall.groupby(['konum_dosyasi', 'alan_ismi'])

        for (konum_dosyasi, alan_ismi), df_area in grouped_by_area_for_charts:
            if df_area.empty:
                continue
            
            area_key = f"{konum_dosyasi}_{alan_ismi}" # JS'de kullanmak için benzersiz bir anahtar
            chart_data_per_area[area_key] = {}

            # a. Alan İçin Saatlik Toplam Yoğunluk
            saatlik_alan_data = df_area.groupby('saat_dilimi').size().sort_index()
            chart_data_per_area[area_key]['saatlikToplam'] = {
                "labels": saatlik_alan_data.index.astype(str).tolist(),
                "data": saatlik_alan_data.values.tolist()
            }

            # b. Alan İçin Günlük Toplam Yoğunluk
            gunluk_alan_data = df_area.groupby('gun_adi_kategorik', observed=False).size().reindex(gun_sirasi, fill_value=0)
            chart_data_per_area[area_key]['gunlukToplam'] = {
                "labels": gunluk_alan_data.index.tolist(),
                "data": gunluk_alan_data.values.tolist()
            }

            # c. Alan İçin Taşıt Tipi Dağılımı (Pasta Grafik için)
            tasit_tipi_alan_data = df_area["tasit_tipi"].value_counts()
            chart_data_per_area[area_key]['tasitTipiDagitimi'] = {
                "labels": tasit_tipi_alan_data.index.tolist(),
                "data": tasit_tipi_alan_data.values.tolist()
            }
            
        # Excel Raporu Oluşturma 
        output_excel_path = output_path / f"alan_bazli_analiz_raporu_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        with pd.ExcelWriter(output_excel_path) as writer:
            # Genel Özet Sayfası
            start_row_genel = 0
            genel_tasit_sayilari = df_filtered_overall["tasit_tipi"].value_counts().reset_index()
            genel_tasit_sayilari.columns = ['Taşıt Tipi', 'Toplam Sayı (Tüm Alanlar)']
            genel_tasit_sayilari.to_excel(writer, sheet_name='Genel Özet', index=False, startrow=start_row_genel)
            start_row_genel += len(genel_tasit_sayilari) + 2 

            pd.DataFrame(chart_data_overall['saatlikToplam']).rename(
                columns={'labels':'Saat Dilimi', 'data':'Toplam Geçiş (Tüm Alanlar)'}
            ).to_excel(writer, sheet_name='Genel Özet', index=False, startrow=start_row_genel)
            start_row_genel += len(chart_data_overall['saatlikToplam']['labels']) +3 # dataframe index ve başlıkları için
            
            pd.DataFrame(chart_data_overall['gunlukToplam']).rename(
                columns={'labels':'Gün Adı', 'data':'Toplam Geçiş (Tüm Alanlar)'}
            ).to_excel(writer, sheet_name='Genel Özet', index=False, startrow=start_row_genel)

            # Alan Bazlı Detaylı Analizler için Sayfalar (önceki gibi)
            if 'konum_dosyasi' in df_filtered_overall.columns and 'alan_ismi' in df_filtered_overall.columns:
                grouped_by_area_for_excel = df_filtered_overall.groupby(['konum_dosyasi', 'alan_ismi'])
                for (konum_dosyasi, alan_ismi), df_area_excel in grouped_by_area_for_excel:
                    if df_area_excel.empty:
                        continue
                    sheet_name_raw = f"{konum_dosyasi}_{alan_ismi}"
                    sheet_name = "".join(c if c.isalnum() else "_" for c in sheet_name_raw)[:30]
                    
                    
                    # Önceki yanıttaki current_row takibi ile tüm tabloları (taşıt tipi, saatlik toplam/detay, günlük toplam/detay) yazdırma muratiyedim
                    print(f"Excel için '{sheet_name}' sayfası oluşturuluyor...") # Sadece bilgilendirme
                    df_area_excel.to_excel(writer, sheet_name=f"Detay_{sheet_name}", index=False) # Örnek bir detay sayfası


        return {
            "status": "success", 
            "message": f"Analiz tamamlandı. Rapor: {output_excel_path.name}",
            "filepath": str(output_excel_path),
            "chart_data_overall": chart_data_overall, # Genel grafik verisi
            "chart_data_per_area": chart_data_per_area # ALAN BAZLI GRAFİK VERİSİ 
        }
    except Exception as e:
        print(f"perform_data_analysis fonksiyonunda genel hata: {e}")
        traceback.print_exc() 
        return {"status": "error", "message": f"Veri analizi sırasında bir hata oluştu: {e}"}


#########################################
# RUN EEL
#########################################
def find_free_port():
    """Find a free port starting from 8000"""
    port = 8000
    while port < 9000:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('localhost', port))
                return port
        except OSError:
            port += 1
    raise RuntimeError("No free ports found between 8000-9000")


try:
    # Get a free port
    port = find_free_port()
    print(f"Starting application on port {port}")
    
    # Start eel with the free port
    eel.start('index.html', size=(1280, 800), position=(50, 50), port=port, host='localhost', block=True)
except (SystemExit, MemoryError, KeyboardInterrupt):
    print("Uygulama kapatılıyor.")
except Exception as e:
    print("Uygulama başlatılırken bir hata oluştu:")
    print(e)
    traceback.print_exc()
    input("Çıkmak için Enter'a basın...")
