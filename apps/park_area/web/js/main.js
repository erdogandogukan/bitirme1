// main.js

// (1) Sayfa yüklendiğinde init()'i başlatacak
document.addEventListener('DOMContentLoaded', init);

// (2) Tüm setup adımlarını buradan çağıracağız
async function init() {
  await initCameraList();
  bindSourceSelection();
  bindFolderSelector();
  // bindResizeSlider();
  bindStartStopButtons();
  bindTabSwitching();
  bindCoordinateFileInput();
  // bindVideoFileInput();
  bindVideoSelector();
  bindCreateCoordinateFile();
  bindSelectorCoordinateFileInput();
  bindSelectorStart();
}

// (A) Kamera listesini dolduracak fonksiyon
async function initCameraList() {
  // 1) cameraSelect elementini al
  const cameraSelect = document.getElementById('cameraSelect');
  // (İsterseniz eski seçenekleri temizleyin)
  cameraSelect.innerHTML = '';

  // 2) Python'dan bağlı kameraları çekin
  const cameras = await eel.find_camera_devices()();

  // 3) Her bir kamera için option oluşturup dropdown'a ekleyin
  cameras.forEach(camIdx => {
    const opt = document.createElement('option');
    opt.value = camIdx;
    opt.textContent = `Kamera ${camIdx}`;
    cameraSelect.appendChild(opt);
  });
}

// (B) Kamera / Video kaynak seçim radyo butonları
function bindSourceSelection() {
  const cameraSelect   = document.getElementById('cameraSelect');
  const selectVideoBtn = document.getElementById('selectVideoBtn');
  const videoPathInput = document.getElementById('videoPath');
  const ipRadio        = document.getElementById('ipSource');
  const ipUrlInput     = document.getElementById('ipUrl');
  const cameraRadio    = document.getElementById('cameraSource');
  const videoRadio     = document.getElementById('videoSource');

  // başlangıçta kamera seçili
  cameraSelect.disabled   = false;
  selectVideoBtn.disabled = true;
  videoPathInput.disabled = true;
  ipUrlInput.disabled     = true;

  cameraRadio.addEventListener('change', () => {
    cameraSelect.disabled   = false;
    selectVideoBtn.disabled = true;
    videoPathInput.disabled = true;
    ipUrlInput.disabled     = true;
  });
  videoRadio.addEventListener('change', () => {
    cameraSelect.disabled   = true;
    selectVideoBtn.disabled = false;
    videoPathInput.disabled = false;
    ipUrlInput.disabled     = true;
  });
  ipRadio.addEventListener('change', () => {
    cameraSelect.disabled   = true;
    selectVideoBtn.disabled = true;
    videoPathInput.disabled = true;
    ipUrlInput.disabled     = false;
  });
}

// (C) Klasör Seç butonunu bağlar
function bindFolderSelector() {
  const selectBtn = document.getElementById('selectFolder');
  const folderPathInput = document.getElementById('folderPath');

  selectBtn.addEventListener('click', async () => {
    // Python tarafındaki filedialog’u aç
    const chosenPath = await eel.select_folder()();
    if (chosenPath) {
      folderPathInput.value = chosenPath;
    }
  });
}

// (D) Slider’ı ve label’ı senkronize eden fonksiyon
function bindResizeSlider() {
  const slider = document.getElementById('resizeSlider');
  const label  = document.getElementById('resizeValue');

  // Başlangıç değeri
  label.textContent = `${slider.value}%`;

  // Kullanıcı slider’ı hareket ettirdikçe label güncellensin
  slider.addEventListener('input', () => {
    label.textContent = `${slider.value}%`;
  });
}

// (E) Başla / Durdur butonlarını ve get_frame döngüsünü yönetir
// main.js

function bindStartStopButtons() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const errorBox = document.getElementById('errorBox');
    const videoFeed = document.getElementById('videoFeed');
    const statusImage = document.getElementById('statusImage');
    const parkingStatus = document.getElementById('parkingStatus');

    let videoInterval = null;

    startBtn.addEventListener('click', async () => {
        try {
            // Clear any previous errors
            errorBox.classList.add('hidden');

            // Get selected source
            const source = document.querySelector('input[name="source"]:checked').value;
            let sourceValue;
            
            switch(source) {
                case 'camera':
                    sourceValue = parseInt(document.getElementById('cameraSelect').value);
                    if (!sourceValue && sourceValue !== 0) {
                        throw new Error('Lütfen kamera seçin');
                    }
                    break;
                case 'video':
                    sourceValue = document.getElementById('videoPath').value;
                    if (!sourceValue) {
                        throw new Error('Lütfen video dosyası seçin');
                    }
                    break;
                case 'ip':
                    sourceValue = document.getElementById('ipUrl').value;
                    if (!sourceValue) {
                        throw new Error('Lütfen IP kamera adresi girin');
                    }
                    break;
            }

            // Get coordinate file path
            const coordPath = document.getElementById('coordinatePath').dataset.path;
            if (!coordPath) {
                throw new Error('Lütfen koordinat dosyası seçin');
            }

            // Start video processing
            const response = await eel.start_video(sourceValue, coordPath, 100)();
            
            if (!response.success) {
                throw new Error(response.error || 'Video başlatılamadı');
            }

            // Update UI
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');

            // Start frame update interval
            if (videoInterval) clearInterval(videoInterval);
            videoInterval = setInterval(async () => {
                const frameData = await eel.get_frame()();
                if (frameData.success) {
                    videoFeed.src = `data:image/jpeg;base64,${frameData.frame}`;
                    statusImage.src = `data:image/jpeg;base64,${frameData.overlay}`;
                    updateParkingStatus(frameData.parkingStatus);
                }
            }, 100);

        } catch (error) {
            // Show error
            errorBox.textContent = error.message;
            errorBox.classList.remove('hidden');
        }
    });

    // Helper function to update parking status display
    function updateParkingStatus(status) {
        parkingStatus.innerHTML = '';
        for (const area in status) {
            const areaDiv = document.createElement('div');
            areaDiv.className = 'area';
            areaDiv.innerHTML = `<h4>${area}</h4>`;
            
            for (const [cell, state] of Object.entries(status[area])) {
                const cellSpan = document.createElement('span');
                cellSpan.className = `cell ${state === 'BOS' ? 'free' : 'occupied'}`;
                cellSpan.textContent = `${cell}: ${state}`;
                areaDiv.appendChild(cellSpan);
            }
            
            parkingStatus.appendChild(areaDiv);
        }
    }
}





// (F) Tab butonlarına tıklanınca ilgili içerikleri göster/gizle
function bindTabSwitching() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const selectorTab = document.getElementById('selectorTab');
  const mainContent = document.querySelector('.content-area');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Tüm butonlardan .active sınıfını kaldır
      tabBtns.forEach(b => b.classList.remove('active'));
      // Tıklanan butona ekle
      btn.classList.add('active');

      // İçerikleri gizle
      selectorTab.classList.toggle('hidden', btn.dataset.tab !== 'selector');
      mainContent.classList.toggle('hidden', btn.dataset.tab === 'selector');
    });
  });
}

// (G) Koordinat dosyası seçildiğinde handle_coordinate_file'i çağırır
function bindCoordinateFileInput() {
  const coordFileInput = document.getElementById('coordinateFile');
  const coordPathEl    = document.getElementById('coordinatePath');
  const errorBox       = document.getElementById('errorBox');

  coordFileInput.addEventListener('change', async (e) => {
    if (!e.target.files.length) return;              // Dosya yoksa çık
    const file = e.target.files[0];

    // 1) Görsel için görünürdeki metni güncelle
    coordPathEl.value = file.name;

    // 2) Dosyayı oku
    const content = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Dosya okunamadı'));
      reader.readAsText(file);
    });

    // 3) Python tarafına gönder
    const res = await eel.handle_coordinate_file(content, file.name)();
    if (res.success) {
      // 4) Başarılıysa gerçek path'i dataset'e kaydet
      coordPathEl.dataset.path = res.path;
      errorBox.textContent = '';
      const coords = await eel.get_coordinates()();
      // document.getElementById('coordinateStatus').innerText =
      //   JSON.stringify(coords, null, 2);
    } else {
      // 5) Hata varsa ekranda göster
      errorBox.textContent = 'Koordinat dosyası yüklenemedi: ' + res.error;
    }
  });
}

// main.js’in en altına veya bindVideoFileInput’ın hemen üstüne ekleyin:
function bindVideoSelector() {
  const btn      = document.getElementById('selectVideoBtn');
  const pathIn   = document.getElementById('videoPath');
  const errorBox = document.getElementById('errorBox');

  btn.addEventListener('click', async () => {
    errorBox.textContent = '';
    const filePath = await eel.request_video_file_path()();  // Python'dan gerçek yol
    if (!filePath) {
      errorBox.textContent = 'Video seçilmedi!';
      return;
    }
    pathIn.value = filePath;
  });
}




// (H) Video dosyası seçildiğinde sadece adı gösterir
function bindVideoFileInput() {
  const videoFileInput = document.getElementById('videoFile');
  const videoPathInput  = document.getElementById('videoPath');
  const errorBox        = document.getElementById('errorBox');

  videoFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Dosya adı görünür input'a yaz
    videoPathInput.value = file.name;
    // Özellikle hata kutusunu temizleyelim
    errorBox.textContent = '';
  });
}


function bindCreateCoordinateFile() {
  const btn       = document.getElementById('createCoordinateFile');
  const nameInput = document.getElementById('fileNaming');
  const errorBox  = document.getElementById('errorBox');
  const mainCoordPathIn = document.getElementById('coordinatePath');
  const selectorCoordAddr = document.getElementById('selectorCoordinateAddress');

  btn.addEventListener('click', async () => {
    errorBox.textContent = '';
    const fileName = nameInput.value.trim();
    if (!fileName) {
      return errorBox.textContent = 'Lütfen bir dosya adı girin!';
    }

    // Python fonksiyonunu çağırıyoruz
    const res = await eel.create_coordinate_file(fileName)();
    if (!res.success) {
      errorBox.textContent = res.message || 'Dosya oluşturulamadı!';
      return;
    }

    // Oluşan gerçek path'i hem ana panele hem selector tab'a yaz
    mainCoordPathIn.value = fileName;
    mainCoordPathIn.dataset.path = res.path;

    selectorCoordAddr.value = fileName;
    selectorCoordAddr.dataset.path = res.path;

    errorBox.textContent = res.message; // "Dosyanız başarılı bir şekilde oluşturuldu..."
  });
}

function bindSelectorCoordinateFileInput() {
  const fileInput = document.getElementById('selectorCoordinateFile');
  const addressIn = document.getElementById('selectorCoordinateAddress');
  const errorBox  = document.getElementById('errorBox');

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    addressIn.value = file.name;
    errorBox.textContent = '';

    // Dosyayı oku
    const content = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Dosya okunamadı'));
      reader.readAsText(file);
    });

    // Python'a gönder
    const res = await eel.handle_coordinate_file(content, file.name)();
    if (res.success) {
      addressIn.dataset.path = res.path;
    } else {
      errorBox.textContent = 'Koordinat dosyası yüklenemedi: ' + res.error;
    }
  });
}

// (I) Selector sekmesindeki Başlat butonunu bağlar
// ———————— (2) bindSelectorStart fonksiyonu ————————
function bindSelectorStart() {
  const selectorStartBtn  = document.getElementById('selectorStartBtn');
  const selectorCoordIn   = document.getElementById('selectorCoordinateAddress');
  const selectorAreaIn    = document.getElementById('selectorAreaName');
  const selectorCellIn    = document.getElementById('selectorCellName');
  const cameraRadio       = document.getElementById('cameraSource');
  const videoRadio   = document.getElementById('videoSource');
  const ipRadio           = document.getElementById('ipSource');
  const videoPathInput = document.getElementById('videoPath');
  const ipUrlInput     = document.getElementById('ipUrl');
  const cameraSelect      = document.getElementById('cameraSelect');
  
  const errorBox          = document.getElementById('errorBox');

  selectorStartBtn.addEventListener('click', async () => {
    errorBox.textContent = '';

    // 1) JSON ve input kontrolleri
    const coordFile = selectorCoordIn.dataset.path || selectorCoordIn.value;
    if (!coordFile) {
      return errorBox.textContent = 'Koordinat dosyası seçilmedi!';
    }
    const areaName = selectorAreaIn.value.trim();
    if (!areaName) {
      return errorBox.textContent = 'Alan adı boş olamaz!';
    }
    const cellName = selectorCellIn.value.trim();
    if (!cellName) {
      return errorBox.textContent = 'Hücre adı boş olamaz!';
    }

    // 2) Kaynak seçimi
    let source;
    if (cameraRadio.checked) {
      const cam = cameraSelect.value;
      if (!cam) {
        return errorBox.textContent = 'Kamera seçilmedi!';
      }
      source = parseInt(cam, 10);
    } else {
      const vid = videoPathInput.value;
      if (!vid) {
        return errorBox.textContent = 'Video dosyası seçilmedi!';
      }
      source = vid;
    }

    // 3) start_selector çağrısı (4 argüman!)
    try {
      const res = await eel.start_selector(source, coordFile, areaName, cellName)();
      if (!res.success) {
        errorBox.textContent = res.error;
      } else {
        errorBox.textContent = `Eklenen hücreler: ${res.cells.join(', ')}`;
        // document.getElementById('selectorStatus').innerText =
        //   'Eklenen Hücreler:\n' + res.cells.map(c => c).join(', ');
      }
    } catch (err) {
      errorBox.textContent = 'Selector hata: ' + err.message;
    }
  });
}
///////////////////////////////////////////////////////////////////////////////////////////////
// File selection button handler
document.querySelector('#coordinateFile').nextElementSibling.addEventListener('click', function() {
    document.getElementById('coordinateFile').click();
});

document.getElementById('coordinateFile').addEventListener('change', async function(e) {
    if (this.files.length > 0) {
        const file = this.files[0];
        document.getElementById('coordinatePath').value = file.name;
        
        // Read file content
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                // Handle the coordinate file through eel
                const result = await eel.handle_coordinate_file(e.target.result, file.name)();
                if (!result.success) {
                    showError('Koordinat dosyası yüklenemedi: ' + result.error);
                }
            } catch (error) {
                showError('Koordinat dosyası işlenirken hata oluştu: ' + error);
            }
        };
        reader.readAsText(file);
    }
});

// Start button handler
document.getElementById('startBtn').addEventListener('click', async function() {
    try {
        // Get selected source
        const source = document.querySelector('input[name="source"]:checked').value;
        let sourceValue;
        
        switch(source) {
            case 'camera':
                sourceValue = document.getElementById('cameraSelect').value;
                break;
            case 'video':
                sourceValue = document.getElementById('videoPath').value;
                break;
            case 'ip':
                sourceValue = document.getElementById('ipUrl').value;
                break;
        }

        // Get coordinate file path
        const coordinatePath = document.getElementById('coordinatePath').value;
        if (!coordinatePath) {
            showError('Lütfen bir koordinat dosyası seçin');
            return;
        }

        // Start video processing
        const response = await eel.start_video(sourceValue, coordinatePath, 100)();
        if (response.error) {
            showError(response.error);
            return;
        }

        // Update UI
        this.classList.add('hidden');
        document.getElementById('stopBtn').classList.remove('hidden');

    } catch (error) {
        showError('İşlem başlatılırken hata oluştu: ' + error);
    }
});

// Stop button handler
document.getElementById('stopBtn').addEventListener('click', async function() {
    try {
        const response = await eel.stop_video()();
        if (response.success) {
            // Update UI
            this.classList.add('hidden');
            document.getElementById('startBtn').classList.remove('hidden');
        }
    } catch (error) {
        showError('İşlem durdurulurken hata oluştu: ' + error);
    }
});

// Helper function to show errors
function showError(message) {
    const errorBox = document.getElementById('errorBox');
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorBox.classList.remove('hidden');
    setTimeout(() => {
        errorBox.classList.add('hidden');
    }, 5000);
}
