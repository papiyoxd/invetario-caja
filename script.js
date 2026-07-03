// ==========================================
// CONFIGURACIÓN DE FIREBASE (Usa tus credenciales reales aquí)
// ==========================================
const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_AUTH_DOMAIN",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_STORAGE_BUCKET",
    messagingSenderId: "TU_MESSAGING_SENDER_ID",
    appId: "TU_APP_ID"
};

// Inicializar Firebase si no se ha hecho
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const storage = firebase.storage();

// ==========================================
// VARIABLES GLOBALES Y ESTADO
// ==========================================
let currentUser = null;
let carrito = [];
let productosGlobales = [];

// Elementos del DOM
const productsGrid = document.getElementById('productsGrid');
const ticketList = document.getElementById('ticketList');
const txtTotal = document.getElementById('txtTotal');
const btnPay = document.getElementById('btnPay');
const searchInp = document.getElementById('searchInp');
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const toastSuccess = document.getElementById('toastSuccess');

// Elementos de Navegación
const menuButtons = document.querySelectorAll('.menu-item');
const sections = document.querySelectorAll('.content-section');
const pageTitle = document.getElementById('pageTitle');

// Elementos de Menú Hamburguesa Celular
const btnToggle = document.getElementById('btnToggleSidebar');
const btnClose = document.getElementById('btnCloseSidebar');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
const btnMobileLogout = document.getElementById('btnMobileLogout');

// ==========================================
// CONTROL DE MÓDULOS / NAVEGACIÓN
// ==========================================
function toggleMenu() {
    if (!sidebar || !overlay) return;
    sidebar.classList.toggle('open');
    overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
}

if(btnToggle) btnToggle.addEventListener('click', toggleMenu);
if(btnClose) btnClose.addEventListener('click', toggleMenu);
if(overlay) overlay.addEventListener('click', toggleMenu);

menuButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        if (!target) return;

        // Cambiar botón activo del menú
        menuButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Cambiar sección visible
        sections.forEach(sec => sec.classList.remove('active-section'));
        const targetSec = document.getElementById(target);
        if (targetSec) targetSec.classList.add('active-section');

        // Actualizar título de la barra superior
        pageTitle.textContent = btn.textContent.trim();

        // Cerrar menú si es celular
        if(window.innerWidth < 768) {
            sidebar.classList.remove('open');
            overlay.style.display = 'none';
        }
    });
});

// ==========================================
// INICIO DE SESIÓN COMPACTO
// ==========================================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userInp = document.getElementById('username').value.trim();
    const passInp = document.getElementById('password').value;

    try {
        const snapshot = await db.collection('users').where('username', '==', userInp).get();
        if (snapshot.empty) {
            alert('Usuario no encontrado');
            return;
        }

        let userData = null;
        snapshot.forEach(doc => { userData = doc.data(); });

        if (userData.password === passInp) {
            currentUser = userData;
            document.getElementById('userProfileName').textContent = currentUser.username;
            document.getElementById('userRoleBadge').textContent = currentUser.role.toUpperCase();
            document.getElementById('userAvatar').textContent = currentUser.username.charAt(0).toUpperCase();

            // Restricción de rol
            if (currentUser.role !== 'admin') {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            } else {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
            }

            loginOverlay.style.display = 'none';
            cargarProductos();
            cargarFlujoHoy();
        } else {
            alert('Contraseña incorrecta');
        }
    } catch (error) {
        console.error("Error en login:", error);
    }
});

// Función limpia para Cerrar Sesión
function cerrarSesionSistema() {
    currentUser = null;
    carrito = [];
    loginOverlay.style.display = 'flex';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
}

// Conectar botones de salida
if (document.getElementById('btnLogout')) {
    document.getElementById('btnLogout').addEventListener('click', cerrarSesionSistema);
}
if (btnMobileLogout) {
    btnMobileLogout.addEventListener('click', cerrarSesionSistema);
}

// ==========================================
// RENDERIZADO DE PRODUCTOS (CAJA POS)
// ==========================================
async function cargarProductos() {
    try {
        db.collection('products').onSnapshot(snapshot => {
            productosGlobales = [];
            productsGrid.innerHTML = '';
            
            snapshot.forEach(doc => {
                const prod = { id: doc.id, ...doc.data() };
                productosGlobales.push(prod);
                renderizarTarjetaProducto(prod);
            });
        });
    } catch (error) {
        console.error("Error cargando productos:", error);
    }
}

function renderizarTarjetaProducto(prod) {
    const card = document.createElement('div');
    card.className = 'product-card';
    
    const imgContent = prod.imageUrl 
        ? `<img src="${prod.imageUrl}" alt="${prod.name}">` 
        : `<i class="fa-solid fa-utensils text-slate-400"></i>`;

    card.innerHTML = `
        <span class="prod-stock">${prod.stock} u</span>
        <div class="prod-img">${imgContent}</div>
        <div class="prod-details">
            <h4>${prod.name}</h4>
            <div class="flex justify-between items-center mt-1">
                <span class="text-xs font-black text-slate-700">${parseFloat(prod.price).toFixed(2)} Bs.</span>
                <button class="btn-add-fast" onclick="agregarAlCarrito(event, '${prod.id}')">+</button>
            </div>
        </div>
    `;
    productsGrid.appendChild(card);
}

// Buscador en tiempo real
searchInp.addEventListener('input', () => {
    const query = searchInp.value.toLowerCase();
    productsGrid.innerHTML = '';
    productosGlobales.forEach(prod => {
        if (prod.name.toLowerCase().includes(query)) {
            renderizarTarjetaProducto(prod);
        }
    });
});

// ==========================================
// GESTIÓN DEL CARRITO / TICKET DE VENTA
// ==========================================
window.agregarAlCarrito = function(event, id) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const prod = productosGlobales.find(p => p.id === id);
    if (!prod) return;

    if (prod.stock <= 0) {
        alert("¡Producto sin stock disponible!");
        return;
    }

    const itemCar = carrito.find(c => c.id === id);
    if (itemCar) {
        if (itemCar.cantidad >= prod.stock) {
            alert("No puedes agregar más de lo que hay en stock.");
            return;
        }
        itemCar.cantidad++;
    } else {
        carrito.push({
            id: prod.id,
            name: prod.name,
            price: prod.price,
            cantidad: 1
        });
    }
    actualizarTicketDOM();
};

function actualizarTicketDOM() {
    if (!ticketList) return;
    ticketList.innerHTML = '';
    let total = 0;

    carrito.forEach((item, index) => {
        const subtotalItem = item.price * item.cantidad;
        total += subtotalItem;

        const row = document.createElement('div');
        row.className = 'ticket-item';
        row.innerHTML = `
            <div class="flex flex-col">
                <span class="font-bold text-slate-800 text-xs">${item.name}</span>
                <span class="item-qty text-[11px]">Cantidad: x${item.cantidad}</span>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-xs font-bold text-slate-700">${subtotalItem.toFixed(2)} Bs.</span>
                <button onclick="removerDelCarrito(${index})" class="text-red-500 text-xs p-1"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;
        ticketList.appendChild(row);
    });

    txtTotal.textContent = `${total.toFixed(2)} Bs.`;
    btnPay.disabled = carrito.length === 0;
}

window.removerDelCarrito = function(index) {
    carrito.splice(index, 1);
    actualizarTicketDOM();
};

document.getElementById('btnLimpiarOrden').addEventListener('click', () => {
    carrito = [];
    actualizarTicketDOM();
});

// Botones de opciones
let servicioSeleccionado = "Mesa";
let pagoSeleccionado = "Efectivo";

document.getElementById('btnServMesa').addEventListener('click', function() {
    this.classList.add('active'); document.getElementById('btnServLlevar').classList.remove('active');
    servicioSeleccionado = "Mesa";
});
document.getElementById('btnServLlevar').addEventListener('click', function() {
    this.classList.add('active'); document.getElementById('btnServMesa').classList.remove('active');
    servicioSeleccionado = "Llevar";
});
document.getElementById('btnPayEfectivo').addEventListener('click', function() {
    this.classList.add('active'); document.getElementById('btnPayQR').classList.remove('active');
    pagoSeleccionado = "Efectivo";
});
document.getElementById('btnPayQR').addEventListener('click', function() {
    this.classList.add('active'); document.getElementById('btnPayEfectivo').classList.remove('active');
    pagoSeleccionado = "QR";
});

// ==========================================
// PROCESAR FACTURACIÓN / COMANDA
// ==========================================
btnPay.addEventListener('click', async () => {
    if (carrito.length === 0) return;

    btnPay.disabled = true;
    let totalFactura = 0;
    const itemsResumen = carrito.map(i => {
        totalFactura += (i.price * i.cantidad);
        return `${i.name} (x${i.cantidad})`;
    }).join(', ');

    const nuevaVenta = {
        fecha: firebase.firestore.Timestamp.now(),
        cajero: currentUser.username,
        items: itemsResumen,
        servicio: servicioSeleccionado,
        pago: pagoSeleccionado,
        monto: totalFactura
    };

    try {
        await db.collection('sales').add(nuevaVenta);

        for (const item of carrito) {
            const prodRef = db.collection('products').doc(item.id);
            await db.runTransaction(async (transaction) => {
                const sfDoc = await transaction.get(prodRef);
                if (!sfDoc.exists) return;
                const nuevoStock = sfDoc.data().stock - item.cantidad;
                transaction.update(prodRef, { stock: nuevoStock >= 0 ? nuevoStock : 0 });
            });
        }

        toastSuccess.classList.add('show');
        setTimeout(() => { toastSuccess.classList.remove('show'); }, 3500);

        carrito = [];
        actualizarTicketDOM();
    } catch (err) {
        console.error("Error al procesar comanda:", err);
        alert("Hubo un error al guardar la venta.");
    } finally {
        btnPay.disabled = false;
    }
});

// ==========================================
// RENDIMIENTO / HISTORIAL DIARIO
// ==========================================
function cargarFlujoHoy() {
    const inicioHoy = new Date();
    inicioHoy.setHours(0,0,0,0);

    db.collection('sales')
      .where('fecha', '>=', inicioHoy)
      .orderBy('fecha', 'desc')
      .onSnapshot(snapshot => {
          const tbody = document.getElementById('tableCajeroPersonalBody');
          if(!tbody) return;
          tbody.innerHTML = '';

          let miTotal = 0;
          let globalDia = 0;
          let efecHoy = 0, qrHoy = 0;

          snapshot.forEach(doc => {
              const v = doc.data();
              globalDia += v.monto;
              
              if (v.cajero === currentUser.username) {
                  miTotal += v.monto;
              }
              if (v.pago === 'Efectivo') efecHoy += v.monto;
              if (v.pago === 'QR') qrHoy += v.monto;

              const hora = v.fecha ? v.fecha.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

              const tr = document.createElement('tr');
              tr.innerHTML = `
                  <td><span class="font-bold text-slate-600">${hora}</span></td>
                  <td class="text-xs">${v.cajero}</td>
                  <td class="max-w-[120px] truncate text-slate-700 font-medium">${v.items}</td>
                  <td><span class="px-2 py-0.5 rounded text-[10px] bg-slate-100 font-bold">${v.servicio}</span></td>
                  <td><span class="px-2 py-0.5 rounded text-[10px] ${v.pago === 'QR' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'} font-black">${v.pago}</span></td>
                  <td style="text-align:right;" class="font-bold">${v.monto.toFixed(2)} Bs.</td>
              `;
              tbody.appendChild(tr);
          });

          document.getElementById('lblMiTotalHoy').textContent = `${miTotal.toFixed(2)} Bs.`;
          document.getElementById('lblVentasDia').textContent = `${globalDia.toFixed(2)} Bs.`;
          document.getElementById('lblEfecHoy').textContent = `${efecHoy.toFixed(2)} Bs.`;
          document.getElementById('lblQrHoy').textContent = `${qrHoy.toFixed(2)} Bs.`;
      });
}