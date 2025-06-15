import cv2

class Camera:
    def __init__(self, *args, **kwargs):
        cam_source = kwargs.get('cam_source', 0)
        if isinstance(cam_source, str):
            # RTSP/HTTP URL’leri FFMPEG ile aç
            self.camera = cv2.VideoCapture(cam_source, cv2.CAP_FFMPEG)
            # 5 saniye açılma zaman aşımı
            self.camera.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
        else:
            # USB kamera indeksi
            self.camera = cv2.VideoCapture(int(cam_source), cv2.CAP_DSHOW)
        if not self.camera.isOpened():
            raise ValueError(f"Unable to open video source: {cam_source}")

    def __del__(self):
        if self.camera.isOpened():
            self.camera.release()

    def get_origin_frames(self):
        if self.camera.isOpened():
            ret, frame = self.camera.read()
            if ret:
                return frame

    def resize_frame(self, img, scale_percent=100):
        # … mevcut resize kodunuz …
        width  = int(img.shape[1] * scale_percent / 100)
        height = int(img.shape[0] * scale_percent / 100)
        return cv2.resize(img, (width, height), interpolation=cv2.INTER_AREA)
