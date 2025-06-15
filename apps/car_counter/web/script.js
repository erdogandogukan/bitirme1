
document.addEventListener('DOMContentLoaded', init);

async function init() {
    console.log("DOM Yüklendi ve init fonksiyonu çalışıyor.");
    openView(null, 'anaGorunum'); // Varsayılan olarak ana görünümü aç
    updateSourceSelection();

    try {
        const cameras = await eel.find_camera_devices()();
        const cameraSelect = document.getElementById('comboBoxCamera');
        cameraSelect.innerHTML = '';
        if (cameras && cameras.length > 0) {
            cameras.forEach(camIndex => {
                cameraSelect.add(new Option(`Kamera ${camIndex}`, camIndex));
            });
            cameraSelect.selectedIndex = 0;
        } else {
            cameraSelect.add(new Option("Kamera bulunamadı", ""));
            showMessage("Kullanılabilir kamera bulunamadı.", "warning");
        }
    } catch (e) {
        showMessage("Hata: Kameralar yüklenemedi: " + e, "error");
    }

    try {
        await refreshKonumListesiJs();
    } catch (e) {
        showMessage("Hata: Konum listeleri yüklenemedi: " + e, "error");
    }
    
    populateTimeSelects('analizAltSaat', 'analizAltDakika', 'analizAltSaniye');
    populateTimeSelects('analizUstSaat', 'analizUstDakika', 'analizUstSaniye');
    
    const browseBtn = document.getElementById('browseVideoPathBtn');
    if (browseBtn) {
        browseBtn.addEventListener('click', async () => {
            const filePath = await eel.request_video_file_path()();
            if (filePath) {
                document.getElementById('entryVideoAdress').value = filePath;
            }
        });
    }
    
    toggleKonumDosyasiInputs(); // Sayaç tanımla sekmesindeki radio butonların durumunu ayarla
    if (document.getElementById('radioMevcutKonum').checked) {
       await loadSectionDetailsForEditing(); 
    }
    console.log("init fonksiyonu tamamlandı.");
}

function showMessage(message, type = "info") {
    const box = document.getElementById('messageBox');
    if (!box) { console.error("Mesaj kutusu bulunamadı!"); return; }
    box.textContent = message;
    box.className = ''; // Önceki sınıfları temizle
    box.style.display = 'block';

    if (type === "error") {
        box.style.backgroundColor = '#dc3545'; // Kırmızı
    } else if (type === "success") {
        box.style.backgroundColor = '#28a745'; // Yeşil
    } else if (type === "warning") {
        box.style.backgroundColor = '#ffc107'; // Sarı 
        box.style.color = '#333';
    } else { // info
        box.style.backgroundColor = '#007bff'; // Mavi
        box.style.color = 'white';
    }
    setTimeout(() => {
        box.style.display = 'none';
        box.style.color = 'white'; // Rengi varsayılana döndür
    }, 5000);
}

function openView(evt, viewName) {
    let i, viewcontent, viewbuttons;
    viewcontent = document.getElementsByClassName("view-content");
    for (i = 0; i < viewcontent.length; i++) {
        viewcontent[i].style.display = "none";
        viewcontent[i].classList.remove("active");
    }
    viewbuttons = document.getElementsByClassName("view-button");
    for (i = 0; i < viewbuttons.length; i++) {
        viewbuttons[i].classList.remove("active");
    }
    const targetView = document.getElementById(viewName);
    if (targetView) {
        targetView.style.display = "flex";
        targetView.classList.add("active");
    }
    if (evt && evt.currentTarget) { // evt null olabilir (init sırasında)
        evt.currentTarget.classList.add("active");
    } else if (!evt && viewName) { // init için, viewName'e göre butonu aktif et
        document.querySelector(`.view-button[onclick*="'${viewName}'"]`)?.classList.add('active');
    }

    if (viewName === 'anaGorunum' && document.getElementById('lineCreatorFeedContainer')) {
        document.getElementById('lineCreatorFeedContainer').style.display = 'none';
        document.getElementById('videoFeed').style.display = 'block';
    }
}

function updateSourceSelection() {
    const radioKamera = document.getElementById('radioKamera');
    const radioVideo = document.getElementById('radioVideo');
    const radioIpCamera = document.getElementById('radioIpCamera'); 

    const kameraAlani = document.getElementById('kameraSecimAlani');
    const videoAlani = document.getElementById('videoSecimAlani');
    const ipKameraAlani = document.getElementById('ipKameraSecimAlani'); 

    const comboBoxCamera = document.getElementById('comboBoxCamera');
    const entryVideoAdress = document.getElementById('entryVideoAdress');
    const browseVideoPathBtn = document.getElementById('browseVideoPathBtn');
    const entryIpCameraUrl = document.getElementById('entryIpCameraUrl'); 

    // Tüm alanların varlığını kontrol et
    if (!radioKamera || !radioVideo || !radioIpCamera || 
        !kameraAlani || !videoAlani || !ipKameraAlani ||
        !comboBoxCamera || !entryVideoAdress || !browseVideoPathBtn || !entryIpCameraUrl) {
        console.error("updateSourceSelection: Gerekli HTML elemanlarından biri bulunamadı!");
        return;
    }

    if (radioKamera.checked) {
        kameraAlani.style.display = 'block';
        videoAlani.style.display = 'none';
        ipKameraAlani.style.display = 'none'; 

        comboBoxCamera.disabled = false;
        entryVideoAdress.disabled = true;
        browseVideoPathBtn.disabled = true;
        entryIpCameraUrl.disabled = true;
    } else if (radioVideo.checked) {
        kameraAlani.style.display = 'none';
        videoAlani.style.display = 'block';
        ipKameraAlani.style.display = 'none'; 

        comboBoxCamera.disabled = true;
        entryVideoAdress.disabled = false;
        browseVideoPathBtn.disabled = false;
        entryIpCameraUrl.disabled = true;
    } else if (radioIpCamera.checked) { 
        kameraAlani.style.display = 'none';
        videoAlani.style.display = 'none';
        ipKameraAlani.style.display = 'block'; 

        comboBoxCamera.disabled = true;
        entryVideoAdress.disabled = true;
        browseVideoPathBtn.disabled = true;
        entryIpCameraUrl.disabled = false; 
    }
}

eel.expose(update_video_frame_js);
function update_video_frame_js(base64Image) {
    try {
        const videoFeed = document.getElementById('videoFeed');
        if (videoFeed) {
            videoFeed.src = `data:image/jpeg;base64,${base64Image}`;
        } else {
            // videoFeed elementi bulunamazsa konsolda görünür.
            console.warn("update_video_frame_js: 'videoFeed' ID'li HTML elementi bulunamadı.");
        }
    } catch (e) {
        console.error("update_video_frame_js içinde bir JavaScript hatası oluştu:", e);
    }
    
}


eel.expose(update_counts_js);
function update_counts_js(data) {
    try {
        if (!data) {
            console.warn("JS update_counts_js: Boş 'data' verisi alındı.");
            return;
        }
        console.log("JS update_counts_js çağrıldı, alınan veri:", JSON.stringify(data)); 

        let totalOverall = data.overall_total || 0;
        let totalCar = 0;
        let totalBus = 0;
        let totalTruck = 0; 
        let totalMotorcycle = 0;
        let totalPerson = 0;
        let totalTir = 0;
        let totalAmbulans = 0;
        let totalMinibus = 0;

        if (data.area_counts && typeof data.area_counts === 'object') {
            for (const areaName in data.area_counts) {
                if (data.area_counts.hasOwnProperty(areaName)) {
                    const areaData = data.area_counts[areaName];
                    totalCar += areaData.car || 0;
                    totalBus += areaData.bus || 0;
                    totalTruck += areaData.truck || 0; 
                    totalMotorcycle += areaData.motorcycle || 0;
                    totalPerson += areaData.person || 0;
                    
                    totalTir += areaData.tir || 0; 
                    totalAmbulans += areaData.ambulans || 0;
                    totalMinibus += areaData.minibus || 0;
                }
            }
        } else {
            console.warn("JS update_counts_js: 'data.area_counts' tanımsız veya obje değil.");
        }

        const updateTotal = (id, textContent) => {
            const element = document.getElementById(id);
            if (element) {
                element.innerText = textContent;
            } else {
                console.warn(`update_counts_js: '${id}' ID'li HTML elementi bulunamadı.`);
            }
        };

        updateTotal('labelCountToplam',     `Toplam : ${totalOverall}`);
        updateTotal('labelCountOtomobil',   `Otomobil: ${totalCar}`);
        updateTotal('labelCountOtobus',     `Otobüs : ${totalBus}`);         
        updateTotal('labelCountKamyon',     `Kamyon : ${totalTruck}`);       
        updateTotal('labelCountMotorsiklet',`Motorsiklet : ${totalMotorcycle}`);
        updateTotal('labelCountTir',        `Tır : ${totalTir}`);
        updateTotal('labelCountAmbulans',   `Ambulans : ${totalAmbulans}`);
        updateTotal('labelCountMinibus',    `Minibüs : ${totalMinibus}`);

        const personCounterElement = document.getElementById('labelCountPerson');
        if (personCounterElement) { // Sadece varsa güncelle
             updateTotal('labelCountPerson', `İnsan (Test): ${totalPerson}`);
        }

        const fpsDisplay = document.getElementById('fpsDisplay');
        if (fpsDisplay && data.fps !== undefined) {
            fpsDisplay.textContent = `FPS: ${data.fps.toFixed(1)}`;
        }

    } catch (e) {
        console.error("update_counts_js içinde bir JavaScript hatası oluştu:", e);
    }
}

eel.expose(show_message_js);
function show_message_js(message, type = "info") {
    showMessage(message, type);
}

eel.expose(refreshKonumListesiJs);
async function refreshKonumListesiJs() { 
    console.log("refreshKonumListesiJs çağrıldı"); 
    try {
        const konumlar = await eel.get_konum_listesi()();
        const secilenKonumSelect = document.getElementById('comboBoxSecilenKonum'); 
        const mevcutKonumlarSelect = document.getElementById('comboBoxMevcutKonumlar');

        [secilenKonumSelect, mevcutKonumlarSelect].forEach(select => {
            if (!select) {
                console.warn("refreshKonumListesiJs: Select elementlerinden biri bulunamadı:", select === secilenKonumSelect ? 'comboBoxSecilenKonum' : 'comboBoxMevcutKonumlar');
                return;
            }
            const currentVal = select.value;
            select.innerHTML = '';
            if (konumlar && konumlar.length > 0) {
                konumlar.forEach(konum => select.add(new Option(konum, konum)));
                if (konumlar.includes(currentVal)) {
                    select.value = currentVal;
                } else if (select.options.length > 0) {
                    select.selectedIndex = 0;
                } else {
                    
                    select.add(new Option("Konumlar yüklenemedi", ""));
                }
            } else {
                select.add(new Option("Konum dosyası yok", ""));
            }
        });
        
        if (mevcutKonumlarSelect && mevcutKonumlarSelect.value && document.getElementById('radioMevcutKonum')?.checked) {
             console.log("loadSectionDetailsForEditing çağrılıyor...");
             await loadSectionDetailsForEditing();
        } else if (mevcutKonumlarSelect && document.getElementById('radioMevcutKonum')?.checked) {
            const scrollInfo = document.getElementById('scrollSectionInfo');
            if (scrollInfo) scrollInfo.innerHTML = '<p>Tanımlı alanları görmek için listeden bir konum dosyası seçin.</p>';
        }

    } catch (e) {
        showMessage("Konum listesi yenilenirken hata (refreshKonumListesiJs): " + e, "error");
        console.error("refreshKonumListesiJs içinde hata:", e);
    }
}

function toggleKonumDosyasiInputs() {
    const isMevcut = document.getElementById('radioMevcutKonum')?.checked;
    const comboBoxMevcutKonumlar = document.getElementById('comboBoxMevcutKonumlar');
    const entryYeniKonum = document.getElementById('entryYeniKonum');

    if (comboBoxMevcutKonumlar) comboBoxMevcutKonumlar.disabled = !isMevcut;
    if (entryYeniKonum) entryYeniKonum.disabled = isMevcut;
    
    if (isMevcut && comboBoxMevcutKonumlar && comboBoxMevcutKonumlar.value) {
        loadSectionDetailsForEditing();
    } else if (isMevcut && comboBoxMevcutKonumlar) { // Mevcut seçili ama değer yoksa
         document.getElementById('scrollSectionInfo').innerHTML = '<p>Listeden bir konum dosyası seçin.</p>';
    } else { // Yeni konum seçiliyse
        document.getElementById('scrollSectionInfo').innerHTML = '<p>Yeni bir konum dosyası oluşturulacak.</p>';
    }
}

async function loadSectionDetailsForEditing() {
    const konumIsmi = document.getElementById('comboBoxMevcutKonumlar')?.value;
    const detailsDiv = document.getElementById('scrollSectionInfo');
    if (!detailsDiv) return;
    detailsDiv.innerHTML = ''; 

    if (!konumIsmi) {
        detailsDiv.innerHTML = '<p>Alanları görmek için bir konum dosyası seçin.</p>';
        return;
    }

    try {
        const sections = await eel.get_section_details(konumIsmi)();
        if (Object.keys(sections).length === 0) {
            detailsDiv.innerHTML = `<p>'${konumIsmi}' içinde tanımlı alan yok.</p>`;
        } else {
            const ul = document.createElement('ul');
            ul.style.listStyleType = 'none';
            ul.style.paddingLeft = '0';
            for (const sectionName in sections) {
                const li = document.createElement('li');
                li.className = 'section-item';
                li.innerHTML = `<span>${sectionName}</span> 
                              <button class="delete-section-btn" onclick="deleteSection('${konumIsmi}', '${sectionName}')">Sil</button>`;
                ul.appendChild(li);
            }
            detailsDiv.appendChild(ul);
        }
    } catch (e) {
        showMessage(`'${konumIsmi}' için alan detayları yüklenemedi: ${e}`, "error");
        detailsDiv.innerHTML = `<p>Alan detayları yüklenirken hata oluştu.</p>`;
    }
}

async function deleteSection(konumIsmi, alanSilIsmi) {
    if (confirm(`'${alanSilIsmi}' alanını '${konumIsmi}' konum dosyasından silmek istediğinizden emin misiniz?`)) {
        const result = await eel.delete_section_from_file(konumIsmi, alanSilIsmi)();
        showMessage(result.message, result.status);
        if (result.status === "success") {
            loadSectionDetailsForEditing(); 
        }
    }
}

async function startLineCreator() {
    const settings = {
        konumSecimiTipi: document.querySelector('input[name="konumSecimi"]:checked')?.value,
        mevcutKonum: document.getElementById('comboBoxMevcutKonumlar')?.value,
        yeniKonumIsmi: document.getElementById('entryYeniKonum')?.value,
        alanIsmiEntry: document.getElementById('entryNewSectionName')?.value
    };

    if (!settings.alanIsmiEntry) {
        showMessage("Lütfen tanımlanacak alan için bir isim girin.", "warning");
        return;
    }
    if (settings.konumSecimiTipi === 'yeni' && !settings.yeniKonumIsmi) {
        showMessage("Yeni konum dosyası için bir isim girin.", "warning");
        return;
    }
    if (settings.konumSecimiTipi === 'mevcut' && !settings.mevcutKonum) {
        showMessage("Mevcut bir konum dosyası seçin.", "warning");
        return;
    }
    
    const result = await eel.start_line_creator_mode(settings)();
    showMessage(result.message, result.status);
    if (result.status === "success") {
        document.getElementById('lineCreatorFeedContainer').style.display = 'block';
        
    }
}

eel.expose(update_line_creator_feed_js);
function update_line_creator_feed_js(base64Image) {
    const imgElement = document.getElementById('lineCreatorFeed');
    const container = document.getElementById('lineCreatorFeedContainer');
    if (base64Image) {
        if(imgElement) imgElement.src = `data:image/jpeg;base64,${base64Image}`;
        if(container) container.style.display = 'block';
    } else {
        if(imgElement) imgElement.src = "";
        if(container) container.style.display = 'none';
    }
}

function handleLineCreatorImageClick(event) {
    const imgElement = document.getElementById('lineCreatorFeed');
    if (!imgElement || !imgElement.src || imgElement.src.endsWith("#") || imgElement.src === "") return; // Görüntü yoksa işlem yapma

    const rect = imgElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    
    const displayWidth = rect.width; 
    const displayHeight = rect.height;

    eel.line_creator_add_point(x, y, displayWidth, displayHeight)();
}

async function saveLineCreatorArea() {
    const result = await eel.line_creator_save_and_exit()();
    showMessage(result.message, result.status);

    if (result.status === "success") {
        document.getElementById('lineCreatorFeedContainer').style.display = 'none';

        if (result.new_konum_listesi) {
            const konumlar = result.new_konum_listesi;
            const secilenKonumSelect = document.getElementById('comboBoxSecilenKonum');
            const mevcutKonumlarSelect = document.getElementById('comboBoxMevcutKonumlar');
            const yeniEklenenKonumDosyasiAdi = document.getElementById('entryYeniKonum').value || document.getElementById('comboBoxMevcutKonumlar').value;


            [secilenKonumSelect, mevcutKonumlarSelect].forEach(select => {
                if (!select) return;
                
                select.innerHTML = '';
                let yeniDosyaSecildiMi = false;
                if (konumlar && konumlar.length > 0) {
                    konumlar.forEach(konum => {
                        const option = new Option(konum, konum);
                        select.add(option);
                        if (konum === yeniEklenenKonumDosyasiAdi) { 
                            option.selected = true;
                            yeniDosyaSecildiMi = true;
                        }
                    });
                    if (!yeniDosyaSecildiMi && select.options.length > 0) {
                         select.selectedIndex = 0; 
                    }
                } else {
                    select.add(new Option("Konum dosyası yok", ""));
                }
            });
        }

        
        if (document.getElementById('radioMevcutKonum').checked) {
             await loadSectionDetailsForEditing();
        } else if (document.getElementById('radioYeniKonum').checked && document.getElementById('entryYeniKonum').value) {
            
            document.getElementById('radioMevcutKonum').checked = true;
            
            toggleKonumDosyasiInputs(); 
        }
    }
}

async function cancelLineCreatorMode() {
    const result = await eel.line_creator_cancel()();
    showMessage(result.message, result.status);
}

// --- Veri Analizi JS Fonksiyonları ---
function populateTimeSelects(hourId, minuteId, secondId) {
    const hourSelect = document.getElementById(hourId);
    const minuteSelect = document.getElementById(minuteId);
    const secondSelect = document.getElementById(secondId);
    if(!hourSelect || !minuteSelect || !secondSelect) return;

    for (let i = 0; i < 24; i++) hourSelect.add(new Option(i.toString().padStart(2, '0'), i));
    for (let i = 0; i < 60; i++) minuteSelect.add(new Option(i.toString().padStart(2, '0'), i));
    for (let i = 0; i < 60; i++) secondSelect.add(new Option(i.toString().padStart(2, '0'), i));
    
    if(hourId.includes("Alt")) {
        hourSelect.value = 0; minuteSelect.value = 0; secondSelect.value = 0;
    } else if (hourId.includes("Ust")) {
        hourSelect.value = 23; minuteSelect.value = 59; secondSelect.value = 59;
    }
}

async function runAnalysis() {
    const altTarihInput = document.getElementById('analizAltTarih').valueAsDate;
    const ustTarihInput = document.getElementById('analizUstTarih').valueAsDate;

    if (!altTarihInput || !ustTarihInput) {
        showMessage("Lütfen geçerli başlangıç ve bitiş tarihleri seçin.", "warning");
        return;
    }

    
    const date_filters = {
        altSinir: {
            year: altTarihInput.getFullYear(),
            month: altTarihInput.getMonth() + 1, // getMonth() 0-11 arası döner
            day: altTarihInput.getDate(),
            hour: document.getElementById('analizAltSaat').value || "0", // Boşsa "0"
            minute: document.getElementById('analizAltDakika').value || "0", // Boşsa "0"
            second: document.getElementById('analizAltSaniye').value || "0"  // Boşsa "0"
        },
        ustSinir: {
            year: ustTarihInput.getFullYear(),
            month: ustTarihInput.getMonth() + 1,
            day: ustTarihInput.getDate(),
            hour: document.getElementById('analizUstSaat').value || "23", // Boşsa "23"
            minute: document.getElementById('analizUstDakika').value || "59", // Boşsa "59"
            second: document.getElementById('analizUstSaniye').value || "59"  // Boşsa "59"
        }
    };
    

    showMessage("Analiz başlatılıyor, lütfen bekleyin...", "info");
    
    try {
        const result = await eel.perform_data_analysis(date_filters)(); // date_filters burada kullanılıyor
        const resultDiv = document.getElementById('analysisResult');
        
        if (resultDiv) resultDiv.textContent = result.message; 
        showMessage(result.message, result.status); 

        if (result.status === "success") {
            if(resultDiv && result.filepath) {
                resultDiv.innerHTML += `<br>Raporun tam yolu (sunucu tarafında): ${result.filepath}`;
            }
            
            // Genel grafikleri çiz
            if (result.chart_data_overall) { 
                if (result.chart_data_overall.saatlikToplam) {
                    cizSaatlikYogunlukGrafigi(result.chart_data_overall.saatlikToplam.labels, result.chart_data_overall.saatlikToplam.data);
                } else {
                     if (saatlikChartInstance) saatlikChartInstance.destroy(); saatlikChartInstance = null;
                }
                if (result.chart_data_overall.gunlukToplam) {
                    cizGunlukYogunlukGrafigi(result.chart_data_overall.gunlukToplam.labels, result.chart_data_overall.gunlukToplam.data);
                } else {
                    if (gunlukChartInstance) gunlukChartInstance.destroy(); gunlukChartInstance = null;
                }
            }

            // Alan bazlı grafikler için veriyi sakla ve dropdown'ı güncelle
            if (result.chart_data_per_area && Object.keys(result.chart_data_per_area).length > 0) { // Python'dan chart_data_per_area olarak geliyor
                globalChartDataPerArea = result.chart_data_per_area;
                alanSecimDropdownGuncelle(Object.keys(globalChartDataPerArea));
                document.getElementById('alanBazliGrafikAlani').style.display = 'block';
                const alanDropdown = document.getElementById('alanSecimDropdownForCharts');
                if (alanDropdown.options.length > 1) { 
                    alanDropdown.selectedIndex = 1;
                    alanGrafikleriniGuncelle();
                } else {
                     alanGrafikleriniGuncelle(); 
                }
            } else {
                globalChartDataPerArea = null;
                alanSecimDropdownGuncelle([]); 
                document.getElementById('alanBazliGrafikAlani').style.display = 'none';
                if (alanSaatlikChartInstance) alanSaatlikChartInstance.destroy(); alanSaatlikChartInstance = null;
                if (alanGunlukChartInstance) alanGunlukChartInstance.destroy(); alanGunlukChartInstance = null;
                if (alanTasitTipiPastaChartInstance) alanTasitTipiPastaChartInstance.destroy(); alanTasitTipiPastaChartInstance = null;
            }

        } else { // Hata durumu
            if (saatlikChartInstance) saatlikChartInstance.destroy(); saatlikChartInstance = null;
            if (gunlukChartInstance) gunlukChartInstance.destroy(); gunlukChartInstance = null;
            if (alanSaatlikChartInstance) alanSaatlikChartInstance.destroy(); alanSaatlikChartInstance = null;
            if (alanGunlukChartInstance) alanGunlukChartInstance.destroy(); alanGunlukChartInstance = null;
            if (alanTasitTipiPastaChartInstance) alanTasitTipiPastaChartInstance.destroy(); alanTasitTipiPastaChartInstance = null;
            document.getElementById('alanBazliGrafikAlani').style.display = 'none';
        }
    } catch (error) {
        console.error("runAnalysis içinde JavaScript hatası:", error);
        showMessage("Analiz sırasında JavaScript hatası: " + error.message, "error");
    }
}

// --- Ana Kontrol Fonksiyonları (Start/Stop) ---
async function startProcessing() {
    let sourceType = "";
    let sourcePath = "";

    if (document.getElementById('radioKamera').checked) {
        sourceType = "camera";
        sourcePath = document.getElementById('comboBoxCamera').value;
        if (!sourcePath && document.getElementById('comboBoxCamera').options.length > 0 && document.getElementById('comboBoxCamera').options[0].value !== "") {
            
             sourcePath = document.getElementById('comboBoxCamera').options[0].value; 
        } else if (!sourcePath) {
            showMessage("Lütfen bir bilgisayar kamerası seçin.", "warning"); return;
        }

    } else if (document.getElementById('radioVideo').checked) {
        sourceType = "video";
        sourcePath = document.getElementById('entryVideoAdress').value;
        if (!sourcePath) {
            showMessage("Lütfen bir video dosyası yolu girin veya seçin.", "warning"); return;
        }
    } else if (document.getElementById('radioIpCamera').checked) {
        sourceType = "ip_camera";
        sourcePath = document.getElementById('entryIpCameraUrl').value;
        if (!sourcePath) {
            showMessage("Lütfen IP Kamera RTSP adresini girin.", "warning"); return;
        }
    } else {
        showMessage("Lütfen bir video kaynağı seçin.", "warning"); return;
    }

    const settings = {
        sourceType: sourceType,
        sourcePath: sourcePath,
        secilenKonumFile: document.getElementById('comboBoxSecilenKonum').value
    };

    if (!settings.secilenKonumFile) {
        showMessage("Lütfen çalışılacak bir konum (alanlar) dosyası seçin.", "warning"); return;
    }

    const result = await eel.start_video_processing(settings)();
    showMessage(result.message, result.status);
    if (result.status === "success") {
        document.getElementById('buttonStart').classList.add('hidden');
        document.getElementById('buttonStop').classList.remove('hidden');
    }
}

async function stopProcessing() {
    const result = await eel.stop_video_processing()();
    showMessage(result.message, result.status);
    if (result.status === "success") {
        document.getElementById('videoFeed').src = ""; 
        document.getElementById('buttonStart').classList.remove('hidden');
        document.getElementById('buttonStop').classList.add('hidden');
        document.getElementById('fpsDisplay').textContent = "FPS: 0.0";
        
    }
}

// Mevcut grafik nesnelerini saklamak için global değişkenler
let saatlikChartInstance = null;
let gunlukChartInstance = null;
let globalChartDataPerArea = null;
let alanSaatlikChartInstance = null; 
let alanGunlukChartInstance = null;  
let alanTasitTipiPastaChartInstance = null; 

function cizSaatlikYogunlukGrafigi(labels, data, chartId = 'saatlikYogunlukChart', chartTitle = 'Saatlik Toplam Geçiş Yoğunluğu') {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) {
        console.error(`Canvas elementi bulunamadı: ${chartId}`);
        return null; 
    }

    
    if (chartId === 'saatlikYogunlukChart' && saatlikChartInstance) saatlikChartInstance.destroy();
    else if (chartId === 'alanSaatlikChart' && alanSaatlikChartInstance) alanSaatlikChartInstance.destroy();

    const newChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: chartTitle,
                data: data,
                backgroundColor: 'rgba(54, 162, 235, 0.7)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Geçiş Sayısı' } },
                      x: { title: { display: true, text: 'Saat Dilimi' } } }
        }
    });
    if (chartId === 'saatlikYogunlukChart') saatlikChartInstance = newChart;
    else if (chartId === 'alanSaatlikChart') alanSaatlikChartInstance = newChart;
    return newChart;
}

function cizGunlukYogunlukGrafigi(labels, data, chartId = 'gunlukYogunlukChart', chartTitle = 'Günlük Toplam Geçiş Yoğunluğu') {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) {
        console.error(`Canvas elementi bulunamadı: ${chartId}`);
        return null;
    }

    if (chartId === 'gunlukYogunlukChart' && gunlukChartInstance) gunlukChartInstance.destroy();
    else if (chartId === 'alanGunlukChart' && alanGunlukChartInstance) alanGunlukChartInstance.destroy();
    
    const newChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: chartTitle,
                data: data,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 2, fill: false, tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Geçiş Sayısı' } },
                      x: { title: { display: true, text: 'Gün' } } }
        }
    });
    if (chartId === 'gunlukYogunlukChart') gunlukChartInstance = newChart;
    else if (chartId === 'alanGunlukChart') alanGunlukChartInstance = newChart;
    return newChart;
}

function cizAlanBazliTasitTipiPastasi(labels, data, chartId = 'alanTasitTipiPastaChart', chartTitle = 'Taşıt Tipi Dağılımı') {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) {
        console.error(`Canvas elementi bulunamadı: ${chartId}`);
        return null;
    }

    if (alanTasitTipiPastaChartInstance) {
        alanTasitTipiPastaChartInstance.destroy();
    }
    
   
    const backgroundColors = labels.map(() => `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.7)`);

    alanTasitTipiPastaChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels, 
            datasets: [{
                label: chartTitle,
                data: data, // 
                backgroundColor: backgroundColors,
                borderColor: backgroundColors.map(color => color.replace('0.7', '1')), 
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: chartTitle
                }
            }
        }
    });
    return alanTasitTipiPastaChartInstance;
}

function alanSecimDropdownGuncelle(alanAdlari) {
    const dropdown = document.getElementById('alanSecimDropdownForCharts');
    if (!dropdown) return;
    dropdown.innerHTML = '<option value="">-- Alan Seçin --</option>'; 
    if (alanAdlari && alanAdlari.length > 0) {
        alanAdlari.forEach(alanKey => {
            
            
            const readableName = alanKey.replace("_", " - "); 
            dropdown.add(new Option(readableName, alanKey));
        });
        dropdown.disabled = false;
        
        // dropdown.selectedIndex = 1; // "-- Alan Seçin --" den sonraki ilk alan
        // alanGrafikleriniGuncelle(); 
    } else {
        dropdown.add(new Option("Analizde alan bulunamadı", ""));
        dropdown.disabled = true;
    }
}

function alanGrafikleriniGuncelle() {
    const secilenAlanKey = document.getElementById('alanSecimDropdownForCharts')?.value;
    if (!secilenAlanKey || !globalChartDataPerArea || !globalChartDataPerArea[secilenAlanKey]) {
        
        if (alanSaatlikChartInstance) alanSaatlikChartInstance.destroy();
        if (alanGunlukChartInstance) alanGunlukChartInstance.destroy();
        if (alanTasitTipiPastaChartInstance) alanTasitTipiPastaChartInstance.destroy();
        alanSaatlikChartInstance = null;
        alanGunlukChartInstance = null;
        alanTasitTipiPastaChartInstance = null;
        document.getElementById('alanSaatlikChartTitle').innerText = "Saatlik Yoğunluk";
        document.getElementById('alanGunlukChartTitle').innerText = "Günlük Yoğunluk";
        document.getElementById('alanTasitTipiChartTitle').innerText = "Taşıt Tipi Dağılımı";
        return;
    }

    const alanVerisi = globalChartDataPerArea[secilenAlanKey];
    const okunabilirAlanAdi = secilenAlanKey.replace("_", " - ");

    document.getElementById('alanSaatlikChartTitle').innerText = `${okunabilirAlanAdi} - Saatlik Yoğunluk`;
    document.getElementById('alanGunlukChartTitle').innerText = `${okunabilirAlanAdi} - Günlük Yoğunluk`;
    document.getElementById('alanTasitTipiChartTitle').innerText = `${okunabilirAlanAdi} - Taşıt Tipi Dağılımı`;

    if (alanVerisi.saatlikToplam) {
        cizSaatlikYogunlukGrafigi(alanVerisi.saatlikToplam.labels, alanVerisi.saatlikToplam.data, 'alanSaatlikChart', `${okunabilirAlanAdi} Saatlik`);
    }
    if (alanVerisi.gunlukToplam) {
        cizGunlukYogunlukGrafigi(alanVerisi.gunlukToplam.labels, alanVerisi.gunlukToplam.data, 'alanGunlukChart', `${okunabilirAlanAdi} Günlük`);
    }
    if (alanVerisi.tasitTipiDagitimi) {
        cizAlanBazliTasitTipiPastasi(alanVerisi.tasitTipiDagitimi.labels, alanVerisi.tasitTipiDagitimi.data, 'alanTasitTipiPastaChart', `${okunabilirAlanAdi} Taşıt Tipleri`);
    }
}