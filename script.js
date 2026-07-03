// CONFIGURACIÓN DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyC3n7TnjNWqTz4aoCgzT23-2dt2_Ot73zQ",
    authDomain: "inventario-caja.firebaseapp.com",
    projectId: "inventario-caja",
    storageBucket: "inventario-caja.firebasestorage.app",
    messagingSenderId: "1046473810130",
    appId: "1:1046473810130:web:c4fefca1f1ee318ee8cd0b"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

let productos = [];
let ventas = [];
let carrito = [];
let usuarioActivo = JSON.parse(localStorage.getItem("session_activa")) || null;
let metodoPagoSeleccionado = "EFECTIVO";
let servicioSeleccionado = "MESA";

let efectivoGlobalHoy = 0;
let qrGlobalHoy = 0;
let totalGlobalHoy = 0;

document.addEventListener("DOMContentLoaded", () => {
    configurarNavegacionTab();
    vincularEventosAdicionales();

    if (usuarioActivo) {
        document.getElementById("userProfileName").innerText = usuarioActivo.user;
        arrancarSincronizacionSaaS(usuarioActivo.restauranteId || "pollo1");
        aplicarPermisosRol(usuarioActivo.role || "admin", usuarioActivo.user);
        document.getElementById("loginOverlay").style.display = "none";
    }
});

function vincularEventosAdicionales() {
    document.getElementById("btnPayEfectivo").addEventListener("click", () => seleccionarMetodoPago("EFECTIVO"));
    document.getElementById("btnPayQR").addEventListener("click", () => seleccionarMetodoPago("QR"));
    document.getElementById("btnServMesa").addEventListener("click", () => seleccionarServicio("MESA"));
    document.getElementById("btnServLlevar").addEventListener("click", () => seleccionarServicio("LLEVAR"));
    document.getElementById("btnLimpiarOrden").addEventListener("click", limpiarCarrito);
    document.getElementById("btnArqueoCaja").addEventListener("click", ejecutarArqueoCaja);
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const uInp = document.getElementById("username").value.trim().toLowerCase();
    const pInp = document.getElementById("password").value;

    try {
        const snapshot = await db.collection("usuarios").where("user", "==", uInp).where("pass", "==", pInp).get();
        if (!snapshot.empty) {
            let cuenta = snapshot.docs[0].data();
            usuarioActivo = cuenta;
            localStorage.setItem("session_activa", JSON.stringify(usuarioActivo));
            
            document.getElementById("userProfileName").innerText = cuenta.user;
            arrancarSincronizacionSaaS(cuenta.restauranteId || "pollo1");
            aplicarPermisosRol(cuenta.role || "admin", cuenta.user);
            document.getElementById("loginOverlay").style.display = "none";
            document.getElementById("loginForm").reset();
        } else {
            alert("Credenciales incorrectas.");
        }
    } catch(err) { alert("Error: " + err); }
});

function arrancarSincronizacionSaaS(restauranteId) {
    db.collection("productos").where("restauranteId", "==", restauranteId).onSnapshot((snapshot) => {
        productos = [];
        snapshot.forEach(doc => {
            let data = doc.data();
            data.id = doc.id;
            productos.push(data);
        });
        renderizarProductosPOS();
        renderizarTablaInventario();
    });

    db.collection("ventas").where("restauranteId", "==", restauranteId).onSnapshot((snapshot) => {
        ventas = [];
        snapshot.forEach(doc => { ventas.push(doc.data()); });
        ventas.sort((a,b) => b.fechaMilisegundos - a.fechaMilisegundos);
        
        calcularReportesYProductos();
        renderizarHistorialVentas();
        renderizarReporteDiarioCajaMonitor();
    });
}

function aplicarPermisosRol(role, username) {
    const badge = document.getElementById("userRoleBadge");
    const avatar = document.getElementById("userAvatar");
    if(badge) badge.innerText = role === "admin" ? "Administrador" : "Cajero";
    if(avatar) avatar.innerText = username.substring(0, 1).toUpperCase();

    const elementosAdmin = document.querySelectorAll(".admin-only");
    elementosAdmin.forEach(el => {
        el.style.display = role === "admin" ? "flex" : "none";
    });
}

function renderizarProductosPOS() {
    const grid = document.getElementById("productsGrid");
    if(!grid) return;
    grid.innerHTML = "";

    productos.forEach((p) => {
        const imgCont = p.imagenUrl ? `<img src="${p.imagenUrl}">` : `<i class="fa-solid fa-utensils"></i>`;
        grid.innerHTML += `
            <div class="product-card" data-name="${p.nombre.toLowerCase()}">
                <div class="prod-stock">${p.stock} u</div>
                <div class="prod-img">${imgCont}</div>
                <div class="prod-details">
                    <h4>${p.nombre}</h4>
                    <span class="category">${p.categoria}</span>
                    <div class="prod-footer">
                        <span class="price">${p.precio.toFixed(2)} Bs.</span>
                        <button class="btn-add" onclick="agregarAlCarrito('${p.id}')">+</button>
                    </div>
                </div>
            </div>
        `;
    });
}

function agregarAlCarrito(idDoc) {
    const prod = productos.find(p => p.id === idDoc);
    if (!prod || prod.stock <= 0) {
        alert("¡No quedan existencias en el inventario!");
        return;
    }

    const itemExistente = carrito.find(item => item.id === idDoc);
    if (itemExistente) {
        if(itemExistente.get_stock_total >= prod.stock) {
            alert("No puedes agregar más de lo que hay en stock.");
            return;
        }
        itemExistente.cantidad += 1;
    } else {
        carrito.push({
            id: prod.id,
            nombre: prod.nombre,
            precio: prod.precio,
            cantidad: 1
        });
    }
    actualizarTicketVisual();
}

function limpiarCarrito() {
    carrito = [];
    actualizarTicketVisual();
}

function seleccionarMetodoPago(metodo) {
    metodoPagoSeleccionado = metodo;
    document.getElementById("btnPayEfectivo").classList.remove("active");
    document.getElementById("btnPayQR").classList.remove("active");
    if(metodo === "EFECTIVO") document.getElementById("btnPayEfectivo").classList.add("active");
    if(metodo === "QR") document.getElementById("btnPayQR").classList.add("active");
}

function seleccionarServicio(tipo) {
    servicioSeleccionado = tipo;
    document.getElementById("btnServMesa").classList.remove("active");
    document.getElementById("btnServLlevar").classList.remove("active");
    if(tipo === "MESA") document.getElementById("btnServMesa").classList.add("active");
    if(tipo === "LLEVAR") document.getElementById("btnServLlevar").classList.add("active");
}

function actualizarTicketVisual() {
    const list = document.getElementById("ticketList");
    let subtotal = 0;
    if(!list) return;
    list.innerHTML = "";

    carrito.forEach(item => {
        let costoLinea = item.precio * item.cantidad;
        subtotal += costoLinea;
        list.innerHTML += `
            <div class="ticket-item">
                <div>
                    <h5 class="font-bold text-slate-800 text-sm">${item.nombre}</h5>
                    <small class="text-slate-500 font-medium">Cantidad: x${item.cantidad}</small>
                </div>
                <div class="font-bold text-slate-800 text-sm">${costoLinea.toFixed(2)} Bs.</div>
            </div>
        `;
    });

    document.getElementById("txtSubtotal").innerText = `${subtotal.toFixed(2)} Bs.`;
    document.getElementById("txtTotal").innerText = `${subtotal.toFixed(2)} Bs.`;
    document.getElementById("btnPay").disabled = carrito.length === 0;
}

function mostrarAlertaFacturaExitosa() {
    const toast = document.getElementById("toastSuccess");
    if(toast) {
        toast.classList.add("show");
        setTimeout(() => { toast.classList.remove("show"); }, 3000);
    }
}

document.getElementById("btnPay").addEventListener("click", async () => {
    let totalCobrado = 0;
    let itemsMapeados = [];
    let itemsTextoFormateado = [];

    for (let item of carrito) {
        let costoLinea = item.precio * item.cantidad;
        totalCobrado += costoLinea;
        
        for(let i=0; i<item.cantidad; i++) {
            itemsMapeados.push(item.nombre);
        }
        itemsTextoFormateado.push(`${item.nombre} (x${item.cantidad})`);

        await db.collection("productos").doc(item.id).update({
            stock: firebase.firestore.FieldValue.increment(-item.cantidad)
        });
    }

    const hoy = new Date();
    const nuevaVenta = {
        restauranteId: usuarioActivo.restauranteId || "pollo1",
        fechaMilisegundos: Date.now(),
        fechaCompleta: hoy.toLocaleString(),
        fechaCorta: hoy.toLocaleDateString(),
        diaSemana: hoy.getDay(), 
        usuario: usuarioActivo.user,
        itemsArray: itemsMapeados, 
        itemsTexto: itemsTextoFormateado.join(", "),
        total: parseFloat(totalCobrado.toFixed(2)),
        metodoPago: metodoPagoSeleccionado,
        servicio: servicioSeleccionado
    };

    db.collection("ventas").add(nuevaVenta).then(() => {
        carrito = [];
        seleccionarMetodoPago("EFECTIVO");
        seleccionarServicio("MESA");
        actualizarTicketVisual();
        mostrarAlertaFacturaExitosa();
    }).catch(err => alert("Error: " + err));
});

function renderizarReporteDiarioCajaMonitor() {
    const tbody = document.getElementById("tableCajeroPersonalBody");
    const lblTotal = document.getElementById("lblMiTotalHoy");
    if(!tbody) return;

    tbody.innerHTML = "";
    const hoyStr = new Date().toLocaleDateString();
    
    efectivoGlobalHoy = 0;
    qrGlobalHoy = 0;
    totalGlobalHoy = 0;

    ventas.forEach(v => {
        const esValido = (usuarioActivo.role === "admin" && v.fechaCorta === hoyStr) || 
                         (usuarioActivo.role === "cajero" && v.usuario === usuarioActivo.user && v.fechaCorta === hoyStr);

        if(esValido) {
            totalGlobalHoy += v.total;
            if(v.metodoPago === "EFECTIVO") efectivoGlobalHoy += v.total;
            if(v.metodoPago === "QR") qrGlobalHoy += v.total;

            const badgePago = v.metodoPago === "EFECTIVO" ? "badge-efectivo" : "badge-qr";
            const badgeServicio = v.servicio === "MESA" ? "badge-mesa" : "badge-llevar";
            const hora = v.fechaCompleta.split(" ")[1] || "";

            let prodChipsHTML = "";
            v.itemsTexto.split(", ").forEach(chip => {
                prodChipsHTML += `<span class="cajero-table-badge-items">${chip}</span>`;
            });

            tbody.innerHTML += `
                <tr style="background:#fff;">
                    <td><strong>${hora}</strong></td>
                    <td><span class="text-orange-600 font-bold">${v.usuario.toUpperCase()}</span></td>
                    <td>${prodChipsHTML}</td>
                    <td><span class="badge-service ${badgeServicio}">${v.servicio || 'MESA'}</span></td>
                    <td><span class="badge-pago ${badgePago}">${v.metodoPago}</span></td>
                    <td class="font-bold text-emerald-600 text-right">${v.total.toFixed(2)} Bs.</td>
                </tr>
            `;
        }
    });
    if(lblTotal) lblTotal.innerText = `${totalGlobalHoy.toFixed(2)} Bs.`;
}

function ejecutarArqueoCaja() {
    alert(`Arqueo Rápido:\nEfectivo: ${efectivoGlobalHoy.toFixed(2)} Bs.\nQR: ${qrGlobalHoy.toFixed(2)} Bs.\nTotal: ${totalGlobalHoy.toFixed(2)} Bs.`);
}

function calcularReportesYProductos() {
    if(usuarioActivo.role !== "admin") return;

    const container = document.getElementById("weeklyDaysContainer");
    if(!container) return;
    container.innerHTML = "";

    const hoyStr = new Date().toLocaleDateString();
    let totalHoy = 0, efecHoy = 0, qrHoy = 0;
    let totalMes = 0, efecMes = 0, qrMes = 0;

    const conteoPorDia = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {}, 0: {} };
    let importesPorDia = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 0: 0 };

    ventas.forEach(v => {
        totalMes += v.total;
        if (v.metodoPago === "EFECTIVO") efecMes += v.total;
        if (v.metodoPago === "QR") qrMes += v.total;

        if (v.fechaCorta === hoyStr) {
            totalHoy += v.total;
            if (v.metodoPago === "EFECTIVO") efecHoy += v.total;
            if (v.metodoPago === "QR") qrHoy += v.total;
        }

        importesPorDia[v.diaSemana] += v.total;

        if (v.itemsArray && Array.isArray(v.itemsArray)) {
            v.itemsArray.forEach(prodName => {
                conteoPorDia[v.diaSemana][prodName] = (conteoPorDia[v.diaSemana][prodName] || 0) + 1;
            });
        }
    });

    document.getElementById("lblVentasDia").innerText = `${totalHoy.toFixed(2)} Bs.`;
    document.getElementById("lblEfecHoy").innerText = efecHoy.toFixed(2);
    document.getElementById("lblQrHoy").innerText = qrHoy.toFixed(2);
    document.getElementById("lblVentasMes").innerText = `${totalMes.toFixed(2)} Bs.`;
    document.getElementById("lblEfecMes").innerText = efecMes.toFixed(2);
    document.getElementById("lblQrMes").innerText = qrMes.toFixed(2);

    let maxVentaSemana = Math.max(...Object.values(importesPorDia), 1);

    const dias = [
        { id: 1, name: "Lunes" }, { id: 2, name: "Martes" }, { id: 3, name: "Miércoles" },
        { id: 4, name: "Jueves" }, { id: 5, name: "Viernes" }, { id: 6, name: "Sábado" }, { id: 0, name: "Domingo" }
    ];

    dias.forEach(d => {
        let montoDia = importesPorDia[d.id];
        let porcentajeBarra = (montoDia / maxVentaSemana) * 100;

        let chipsHTML = "";
        for (const [prod, cant] of Object.entries(conteoPorDia[d.id])) {
            chipsHTML += `<span class="perf-chip-item">${prod} (x${cant})</span>`;
        }
        if(!chipsHTML) chipsHTML = `<span class="text-xs text-slate-400 italic">Sin registros de ventas</span>`;

        container.innerHTML += `
            <div class="perf-table-row">
                <div class="perf-day-col">${d.name}</div>
                <div class="perf-bar-container">
                    <div class="perf-bar-wrapper">
                        <div class="perf-bar-fill" style="width: ${porcentajeBarra}%;"></div>
                    </div>
                    <div class="perf-details-col">
                        ${chipsHTML}
                    </div>
                </div>
                <div class="perf-total-col">${montoDia.toFixed(2)} Bs.</div>
            </div>
        `;
    });
}

function renderizarHistorialVentas() {
    const tbody = document.getElementById("tableHistoryBody");
    if(!tbody || usuarioActivo.role !== "admin") return;
    tbody.innerHTML = "";

    ventas.forEach(v => {
        const badgePago = v.metodoPago === "EFECTIVO" ? "badge-efectivo" : "badge-qr";
        const badgeServicio = v.servicio === "LLEVAR" ? "badge-llevar" : "badge-mesa";
        const horaVenta = v.fechaCompleta.split(" ")[1] || '';

        tbody.innerHTML += `
            <tr>
                <td><strong>${horaVenta}</strong><br><small class="text-slate-400">${v.fechaCorta}</small></td>
                <td><span class="font-semibold">${v.usuario}</span></td>
                <td><div class="text-xs font-medium text-slate-600">${v.itemsTexto}</div></td>
                <td><span class="badge-service ${badgeServicio}">${v.servicio || "MESA"}</span></td>
                <td><span class="badge-pago ${badgePago}">${v.metodoPago}</span></td>
                <td class="font-bold text-emerald-600 text-right">${v.total.toFixed(2)} Bs.</td>
            </tr>
        `;
    });
}

function renderizarTablaInventario() {
    const tbody = document.getElementById("tableInventoryBody");
    if(!tbody || usuarioActivo.role !== "admin") return;
    tbody.innerHTML = "";

    productos.forEach((p) => {
        const thumb = p.imagenUrl ? `<img src="${p.imagenUrl}" class="w-8 h-8 object-cover rounded">` : `<i class="fa-solid fa-utensils text-slate-400"></i>`;
        tbody.innerHTML += `
            <tr>
                <td><div class="w-8 h-8 bg-slate-100 rounded flex items-center justify-center">${thumb}</div></td>
                <td><strong>${p.nombre}</strong></td>
                <td>${p.categoria}</td>
                <td>${p.precio.toFixed(2)} Bs.</td>
                <td><strong>${p.stock} u</strong></td>
                <td style="text-align:center;"><button class="bg-slate-900 text-white text-xs px-2 py-1 rounded" onclick="cargarMasStock('${p.id}', '${p.nombre}')">+ Stock</button></td>
            </tr>
        `;
    });
}

function cargarMasStock(idDoc, nombre) {
    const cant = parseInt(prompt(`¿Cuántas unidades para "${nombre}"?`, "10"));
    if (!isNaN(cant) && cant > 0) {
        db.collection("productos").doc(idDoc).update({ stock: firebase.firestore.FieldValue.increment(cant) });
    }
}

document.getElementById("productForm").addEventListener("submit", function(e) {
    e.preventDefault();
    if(usuarioActivo.role !== "admin") return;

    const name = document.getElementById("prodName").value.trim();
    const price = parseFloat(document.getElementById("prodPrice").value);
    const stock = parseInt(document.getElementById("prodStock").value);
    const category = document.getElementById("prodCategory").value;
    const inputFile = document.getElementById("prodImgFile").files[0];

    const guardarEnFirestore = (urlFoto) => {
        db.collection("productos").add({
            restauranteId: usuarioActivo.restauranteId || "pollo1",
            nombre: name,
            precio: price,
            stock: stock,
            categoria: category,
            imagenUrl: urlFoto
        }).then(() => {
            alert("Subido con éxito.");
            document.getElementById("productForm").reset();
        });
    };

    if (inputFile) {
        const refStorage = storage.ref().child("fotos_productos/" + Date.now() + "_" + inputFile.name);
        refStorage.put(inputFile).then(snap => { snap.ref.getDownloadURL().then(url => guardarEnFirestore(url)); });
    } else { guardarEnFirestore(""); }
});

document.getElementById("userForm").addEventListener("submit", function(e) {
    e.preventDefault();
    if(usuarioActivo.role !== "admin") return;

    const u = document.getElementById("newUsername").value.trim().toLowerCase();
    const p = document.getElementById("newPassword").value;
    const r = document.getElementById("newUserRole").value;

    db.collection("usuarios").add({
        restauranteId: usuarioActivo.restauranteId || "pollo1",
        user: u,
        pass: p,
        role: r
    }).then(() => {
        alert("Personal registrado.");
        document.getElementById("userForm").reset();
    });
});

document.getElementById("searchInp").addEventListener("input", (e) => {
    const txt = e.target.value.toLowerCase();
    document.querySelectorAll(".product-card").forEach(card => {
        card.style.display = card.getAttribute("data-name").includes(txt) ? "block" : "none";
    });
});

function configurarNavegacionTab() {
    const botones = document.querySelectorAll(".menu-item:not(.logout)");
    const secciones = document.querySelectorAll(".content-section");
    botones.forEach(btn => {
        btn.addEventListener("click", () => {
            botones.forEach(b => b.classList.remove("active"));
            secciones.forEach(s => s.classList.remove("active-section"));
            btn.classList.add("active");
            document.getElementById(btn.getAttribute("data-target")).classList.add("active-section");
            document.getElementById("pageTitle").innerText = btn.innerText.trim();
        });
    });
}

document.getElementById("btnLimpiarBD").addEventListener("click", () => {
    if(usuarioActivo.role !== "admin") return;
    if(confirm("¿Deseas borrar el historial?")) {
        db.collection("productos").where("restauranteId", "==", usuarioActivo.restauranteId).get().then(s => s.forEach(d => d.ref.delete()));
        db.collection("ventas").where("restauranteId", "==", usuarioActivo.restauranteId).get().then(s => s.forEach(d => d.ref.delete()));
    }
});

document.getElementById("btnLogout").addEventListener("click", () => {
    localStorage.removeItem("session_activa");
    window.location.reload();
});