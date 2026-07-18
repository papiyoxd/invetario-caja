// ==========================================
// CONFIGURACIÓN DE FIREBASE REAL
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyC3n7TnjNWqTz4aoCgzT23-2dt2_Ot73zQ",
    authDomain: "inventario-caja.firebaseapp.com",
    projectId: "inventario-caja",
    storageBucket: "inventario-caja.appspot.com",
    messagingSenderId: "1046473810130",
    appId: "1:1046473810130:web:c4fefca1f1ee318ee8cd0b",
    measurementId: "G-2WT4LW787T"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const storage = firebase.storage();

// URL de imagen por defecto si se rompe o está vacía (comida elegante / plato)
const DEFAULT_IMAGE_URL = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200&h=150";

// ==========================================
// VARIABLES GLOBALES Y ESTADO
// ==========================================
let currentUser = null;
let carrito = [];
let productosGlobales = [];
let categoriaFiltrada = "Todos";

const productsGrid = document.getElementById('productsGrid');
const ticketList = document.getElementById('ticketList');
const txtTotal = document.getElementById('txtTotal');
const btnPay = document.getElementById('btnPay');
const searchInp = document.getElementById('searchInp');
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const toastSuccess = document.getElementById('toastSuccess');

const menuButtons = document.querySelectorAll('.menu-item');
const sections = document.querySelectorAll('.content-section');
const pageTitle = document.getElementById('pageTitle');

const btnToggle = document.getElementById('btnToggleSidebar');
const btnClose = document.getElementById('btnCloseSidebar');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');

// Variables de pago y calculadora
let servicioSeleccionado = "Mesa";
let pagoSeleccionado = "Efectivo";
const panelVuelto = document.getElementById('panelCalculadoraVuelto');
const inpMontoPago = document.getElementById('inpMontoPago');
const lblVueltoCalculado = document.getElementById('lblVueltoCalculado');

// ==========================================
// CONTROL DE NAVEGACIÓN
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

        menuButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        sections.forEach(sec => sec.classList.remove('active-section'));
        const targetSec = document.getElementById(target);
        if (targetSec) targetSec.classList.add('active-section');

        pageTitle.textContent = btn.textContent.trim();

        if(window.innerWidth < 1024) {
            sidebar.classList.remove('open');
            overlay.style.display = 'none';
        }
    });
});

// ==========================================
// INICIO DE SESIÓN
// ==========================================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userInp = document.getElementById('username').value.trim();
    const passInp = document.getElementById('password').value;

    try {
        const snapshot = await db.collection('usuarios').where('user', '==', userInp).get();
        if (snapshot.empty) {
            alert('Usuario no encontrado');
            return;
        }

        let userData = null;
        snapshot.forEach(doc => { userData = doc.data(); });

        if (userData.pass === passInp) {
            currentUser = userData;
            document.getElementById('userProfileName').textContent = currentUser.user;
            document.getElementById('userRoleBadge').textContent = currentUser.role.toUpperCase();
            document.getElementById('userAvatar').textContent = currentUser.user.charAt(0).toUpperCase();

            if (currentUser.role !== 'admin') {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            } else {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
            }

            loginOverlay.style.display = 'none';
            cargarProductos();
            cargarFlujoHoy();
            inicializarFormularioProductos(); 
            inicializarFormularioAbastecimiento();
        } else {
            alert('Contraseña incorrecta');
        }
    } catch (error) {
        console.error("Error en login:", error);
    }
});

function cerrarSesionSistema() {
    currentUser = null;
    carrito = [];
    loginOverlay.style.display = 'flex';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
}

if (document.getElementById('btnLogout')) {
    document.getElementById('btnLogout').addEventListener('click', cerrarSesionSistema);
}

// ==========================================
// FILTRADO Y RENDERIZADO DE PRODUCTOS (CON FOTO)
// ==========================================
async function cargarProductos() {
    try {
        db.collection('productos').onSnapshot(snapshot => {
            productosGlobales = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.name && data.price !== undefined) {
                    productosGlobales.push({ id: doc.id, ...data });
                }
            });
            filtrarYAplicarProductos();
            renderizarTablaAdministracionInventario();
            actualizarSelectAbastecimiento();
        });
    } catch (error) {
        console.error("Error cargando productos:", error);
    }
}

window.filtrarCategoria = function(cat) {
    categoriaFiltrada = cat;
    document.querySelectorAll('.cat-filter-btn').forEach(btn => {
        if (btn.textContent.trim() === cat) {
            btn.classList.add('bg-slate-900', 'text-white');
            btn.classList.remove('bg-white', 'text-slate-600', 'border');
        } else {
            btn.classList.remove('bg-slate-900', 'text-white');
            btn.classList.add('bg-white', 'text-slate-600', 'border');
        }
    });
    filtrarYAplicarProductos();
};

function filtrarYAplicarProductos() {
    productsGrid.innerHTML = '';
    const query = searchInp.value.toLowerCase();

    productosGlobales.forEach(prod => {
        const coincideCategoria = (categoriaFiltrada === "Todos" || prod.category === categoriaFiltrada);
        const coincideNombre = prod.name.toLowerCase().includes(query);

        if (coincideCategoria && coincideNombre) {
            renderizarTarjetaProducto(prod);
        }
    });
}

// Renderizado con validación de imagen rota (onerror)
function renderizarTarjetaProducto(prod) {
    const card = document.createElement('div');
    card.className = 'product-card';
    const claseStock = prod.stock <= 3 ? 'stock-bajo' : 'stock-alto';

    // Si no hay URL, cargamos directamente la de por defecto
    const urlFinal = prod.imageUrl && prod.imageUrl.trim() !== "" ? prod.imageUrl : DEFAULT_IMAGE_URL;

    // Usamos el 'onerror' inline de HTML para respaldar si el enlace copiado falla
    const imgContent = `<img src="${urlFinal}" onerror="this.onerror=null; this.src='${DEFAULT_IMAGE_URL}';" alt="${prod.name}">`;

    card.innerHTML = `
        <span class="prod-stock ${claseStock}">${prod.stock} u</span>
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

searchInp.addEventListener('input', filtrarYAplicarProductos);

// ==========================================
// ELIMINAR Y GESTIONAR PRODUCTOS (ADMIN)
// ==========================================
window.eliminarProductoDelSistema = async function(id, nombre) {
    if (confirm(`¿Estás seguro de que quieres eliminar "${nombre}" del inventario?`)) {
        try {
            await db.collection('productos').doc(id).delete();
            alert("Producto eliminado correctamente.");
        } catch (error) {
            console.error("Error al eliminar producto:", error);
        }
    }
};

function renderizarTablaAdministracionInventario() {
    const adminTableBody = document.getElementById('adminProductsTableBody');
    if (!adminTableBody) return;

    adminTableBody.innerHTML = '';
    productosGlobales.forEach(prod => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-4 py-2 font-bold text-slate-700">${prod.name}</td>
            <td class="px-4 py-2">${parseFloat(prod.price).toFixed(2)} Bs.</td>
            <td class="px-4 py-2 font-black ${prod.stock <= 3 ? 'text-red-500' : 'text-emerald-600'}">${prod.stock} u</td>
            <td class="px-4 py-2 text-right">
                <button onclick="eliminarProductoDelSistema('${prod.id}', '${prod.name}')" class="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-xs transition-all">
                    <i class="fa-solid fa-trash-can mr-1"></i> Eliminar
                </button>
            </td>
        `;
        adminTableBody.appendChild(tr);
    });
}

// ==========================================
// ADMINISTRADOR: CREACIÓN DE PRODUCTOS
// ==========================================
function inicializarFormularioProductos() {
    const productForm = document.getElementById('productForm');
    if (!productForm) return;

    productForm.replaceWith(productForm.cloneNode(true));
    const cleanProductForm = document.getElementById('productForm');

    cleanProductForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        const btnSubmit = cleanProductForm.querySelector('button[type="submit"]');
        if (btnSubmit) btnSubmit.disabled = true;

        const name = document.getElementById('prodName').value.trim();
        const price = parseFloat(document.getElementById('prodPrice').value);
        const stock = parseInt(document.getElementById('prodStock').value);
        const category = document.getElementById('prodCategory').value;
        const imageUrlInput = document.getElementById('prodImageUrl').value.trim();

        try {
            await db.collection('productos').add({
                name: name,
                price: price,
                stock: stock,
                category: category,
                imageUrl: imageUrlInput, // Guardamos directamente la URL que ingresó el cliente
                fechaCreacion: firebase.firestore.Timestamp.now()
            });

            alert("¡Producto agregado con éxito!");
            cleanProductForm.reset();
        } catch (error) {
            console.error("Error al guardar producto:", error);
        } finally {
            if (btnSubmit) btnSubmit.disabled = false;
        }
    });
}

// ==========================================
// RE-STOCK (INGRESOS DIARIOS)
// ==========================================
function actualizarSelectAbastecimiento() {
    const select = document.getElementById('restockProductSelect');
    if (!select) return;

    const seleccionPrevia = select.value;
    select.innerHTML = '<option value="">-- Selecciona un Producto --</option>';
    
    const ordenados = [...productosGlobales].sort((a,b) => a.name.localeCompare(b.name));
    ordenados.forEach(prod => {
        const option = document.createElement('option');
        option.value = prod.id;
        option.textContent = `${prod.name} (Actual: ${prod.stock} u)`;
        select.appendChild(option);
    });

    if (seleccionPrevia) select.value = seleccionPrevia;
}

function inicializarFormularioAbastecimiento() {
    const restockForm = document.getElementById('restockForm');
    if (!restockForm) return;

    restockForm.replaceWith(restockForm.cloneNode(true));
    const cleanForm = document.getElementById('restockForm');

    cleanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prodId = document.getElementById('restockProductSelect').value;
        const cantAAgregar = parseInt(document.getElementById('restockQuantity').value);

        if (!prodId || isNaN(cantAAgregar) || cantAAgregar <= 0) return;

        try {
            const prodRef = db.collection('productos').doc(prodId);
            await db.runTransaction(async (transaction) => {
                const sfDoc = await transaction.get(prodRef);
                const stockActual = sfDoc.data().stock || 0;
                transaction.update(prodRef, { stock: stockActual + cantAAgregar });
            });

            toastSuccess.classList.add('show');
            setTimeout(() => { toastSuccess.classList.remove('show'); }, 3000);
            cleanForm.reset();
        } catch (error) {
            console.error("Error al abastecer stock:", error);
        }
    });
}

// ==========================================
// GESTIÓN DEL CARRITO
// ==========================================
window.agregarAlCarrito = function(event, id) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const prod = productosGlobales.find(p => p.id === id);
    if (!prod) return;

    const itemCar = carrito.find(c => c.id === id);
    if (itemCar) {
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
                <span class="item-qty text-[11px] text-slate-400">Cantidad: x${item.cantidad}</span>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-xs font-bold text-slate-700">${subtotalItem.toFixed(2)} Bs.</span>
                <button onclick="removerDelCarrito(${index})" class="text-red-500 text-xs p-1"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;
        ticketList.appendChild(row);
    });

    txtTotal.textContent = `${total.toFixed(2)} Bs.`;
    const totalQR = document.getElementById('totalQR');
    if (totalQR) totalQR.textContent = txtTotal.textContent;
    btnPay.disabled = carrito.length === 0;
    calcularVuelto();
}

window.removerDelCarrito = function(index) {
    carrito.splice(index, 1);
    actualizarTicketDOM();
};

document.getElementById('btnLimpiarOrden').addEventListener('click', () => {
    carrito = [];
    actualizarTicketDOM();
});

// Cambios de opción de servicio y pago
document.getElementById('btnServMesa').addEventListener('click', function() {
    this.classList.add('active'); document.getElementById('btnServLlevar').classList.remove('active');
    servicioSeleccionado = "Mesa";
});
document.getElementById('btnServLlevar').addEventListener('click', function() {
    this.classList.add('active'); document.getElementById('btnServMesa').classList.remove('active');
    servicioSeleccionado = "Llevar";
});

const panelQR = document.getElementById("panelQR");

document.getElementById('btnPayEfectivo').addEventListener('click', function() {

    this.classList.add('active');
    document.getElementById('btnPayQR').classList.remove('active');

    pagoSeleccionado = "Efectivo";

    panelVuelto.style.display = "block";
    panelQR.style.display = "none";

});

document.getElementById('btnPayQR').addEventListener('click', function() {

    this.classList.add('active');
    document.getElementById('btnPayEfectivo').classList.remove('active');

    pagoSeleccionado = "QR";

    panelVuelto.style.display = "none";
    panelQR.style.display = "block";

    document.getElementById("totalQR").innerText =
        document.getElementById("txtTotal").innerText;

});

// CALCULADORA DE VUELTO COMPATIBLE CON MÓVILES (EVENTO 'INPUT')
function calcularVuelto() {
    const totalPagar = parseFloat(txtTotal.textContent) || 0;
    const montoPaga = parseFloat(inpMontoPago.value) || 0;

    if (isNaN(montoPaga) || montoPaga < totalPagar) {
        lblVueltoCalculado.textContent = "0.00 Bs.";
        lblVueltoCalculado.className = "font-black text-slate-400";
    } else {
        const vuelto = montoPaga - totalPagar;
        lblVueltoCalculado.textContent = `${vuelto.toFixed(2)} Bs.`;
        lblVueltoCalculado.className = "font-black text-emerald-600";
    }
}
inpMontoPago.addEventListener('input', calcularVuelto);

// ==========================================
// ENVIAR / PROCESAR COMANDA (FACTURACIÓN DIRECTA)
// ==========================================
btnPay.addEventListener('click', () => {
    if (carrito.length === 0) return;
    procesarVentaEnFirebase();
});

async function procesarVentaEnFirebase() {
    btnPay.disabled = true;
    let totalFactura = 0;
    
    const itemsArray = carrito.map(i => {
        totalFactura += (i.price * i.cantidad);
        return { name: i.name, cantidad: i.cantidad };
    });

    const itemsResumenText = itemsArray.map(i => `${i.name} (x${i.cantidad})`).join(', ');

    const nuevaVenta = {
        fecha: firebase.firestore.Timestamp.now(),
        cajero: currentUser.user,
        items: itemsResumenText,
        itemsDetallados: itemsArray, 
        servicio: servicioSeleccionado,
        pago: pagoSeleccionado,
        monto: totalFactura
    };

    try {
        await db.collection('ventas').add(nuevaVenta);

        // Descontar del stock
        for (const item of carrito) {
            const prodRef = db.collection('productos').doc(item.id);
            await db.runTransaction(async (transaction) => {
                const sfDoc = await transaction.get(prodRef);
                if (sfDoc.exists) {
                    const nuevoStock = sfDoc.data().stock - item.cantidad;
                    transaction.update(prodRef, { stock: nuevoStock });
                }
            });
        }

        toastSuccess.classList.add('show');
        setTimeout(() => { toastSuccess.classList.remove('show'); }, 3500);

        carrito = [];
        inpMontoPago.value = "";
        actualizarTicketDOM();
    } catch (err) {
        console.error("Error al procesar venta:", err);
    } finally {
        btnPay.disabled = false;
    }
}

// ==========================================
// FLUJO HISTORIAL Y ARQUEO DE CAJA + REPORTE MENSUAL OPTIMIZADO (SaaS)
// ==========================================
function cargarFlujoHoy() {
    const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const mesesAnio = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    const inicioHoy = new Date();
    inicioHoy.setHours(0,0,0,0);

    const haceSieteDias = new Date();
    haceSieteDias.setDate(haceSieteDias.getDate() - 7);
    haceSieteDias.setHours(0,0,0,0);

    // OPTIMIZACIÓN SaaS: Para evitar leer miles de documentos antiguos del historial,
    // filtramos para traer únicamente las ventas del año en curso.
    const inicioAnioCurso = new Date(new Date().getFullYear(), 0, 1);

    db.collection('ventas')
      .where('fecha', '>=', firebase.firestore.Timestamp.fromDate(inicioAnioCurso))
      .orderBy('fecha', 'desc')
      .onSnapshot(snapshot => {
          
          const tbodyFlujo = document.getElementById('tableCajeroPersonalBody');
          if (tbodyFlujo) tbodyFlujo.innerHTML = '';

          let miTotalHoy = 0, globalDia = 0, efecHoy = 0, qrHoy = 0;

          const arqueoSemanal = {};
          diasSemana.forEach(d => {
              arqueoSemanal[d] = { total: 0, efectivo: 0, qr: 0, productos: {} };
          });

          // Objeto para acumular montos por mes (Ej. "Julio 2026": 5000)
          const acumuladoMensual = {};

          snapshot.forEach(doc => {
              const v = doc.data();
              
              // Validación segura de fecha
              let fechaVenta;
              if (v.fecha && typeof v.fecha.toDate === 'function') {
                  fechaVenta = v.fecha.toDate();
              } else if (v.fecha instanceof Date) {
                  fechaVenta = v.fecha;
              } else {
                  fechaVenta = new Date();
              }

              const nombreDia = diasSemana[fechaVenta.getDay()];
              const mesNombre = mesesAnio[fechaVenta.getMonth()];
              const anioNumero = fechaVenta.getFullYear();
              const llaveMes = `${mesNombre} ${anioNumero}`; // Ej: "Julio 2026"

              const montoValido = parseFloat(v.monto) || 0;

              if (montoValido > 0) {
                  // 1. Lógica SaaS: Agrupación y suma Mensual (Acotado al año en curso gracias al filtro)
                  if (!acumuladoMensual[llaveMes]) {
                      acumuladoMensual[llaveMes] = 0;
                  }
                  acumuladoMensual[llaveMes] += montoValido;

                  // Guardar datos solo de los últimos 7 días para el arqueo diario
                  if (fechaVenta >= haceSieteDias) {
                      arqueoSemanal[nombreDia].total += montoValido;
                      if (v.pago === 'Efectivo') arqueoSemanal[nombreDia].efectivo += montoValido;
                      if (v.pago === 'QR') arqueoSemanal[nombreDia].qr += montoValido;

                      if (v.itemsDetallados && Array.isArray(v.itemsDetallados)) {
                          v.itemsDetallados.forEach(it => {
                              if (it.name) {
                                  if (!arqueoSemanal[nombreDia].productos[it.name]) {
                                      arqueoSemanal[nombreDia].productos[it.name] = 0;
                                  }
                                  arqueoSemanal[nombreDia].productos[it.name] += (parseInt(it.cantidad) || 0);
                              }
                          });
                      }
                  }
              }

              // 2. Filtrado exclusivo de hoy para las tarjetas de control del cajero
              if (fechaVenta >= inicioHoy) {
                  globalDia += montoValido;
                  if (v.cajero === currentUser.user) miTotalHoy += montoValido;
                  if (v.pago === 'Efectivo') efecHoy += montoValido;
                  if (v.pago === 'QR') qrHoy += montoValido;

                  const hora = fechaVenta.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                  if (tbodyFlujo) {
                      const tr = document.createElement('tr');
                      tr.innerHTML = `
                          <td class="py-2 px-3"><span class="font-bold text-slate-600">${hora}</span></td>
                          <td class="py-2 px-3 text-slate-700">${v.cajero || 'Sin cajero'}</td>
                          <td class="py-2 px-3 max-w-[150px] truncate text-slate-600 font-medium">${v.items || ''}</td>
                          <td class="py-2 px-3">
                              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${v.servicio === 'Mesa' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'}">
                                  ${v.servicio || 'Mesa'}
                              </span>
                          </td>
                          <td class="py-2 px-3">
                              <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${v.pago === 'QR' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}">
                                  ${v.pago || 'Efectivo'}
                              </span>
                          </td>
                          <td class="py-2 px-3 text-right font-black text-slate-800">${montoValido.toFixed(2)} Bs.</td>
                      `;
                      tbodyFlujo.appendChild(tr);
                  }
              }
          });

          // RENDERIZAR REPORTE MENSUAL (SaaS)
          const mensualCardsContainer = document.getElementById('mensualCardsContainer');
          if (mensualCardsContainer) {
              mensualCardsContainer.innerHTML = '';
              const mesesOrdenados = Object.keys(acumuladoMensual);

              if (mesesOrdenados.length === 0) {
                  mensualCardsContainer.innerHTML = `<p class="text-xs text-slate-400 col-span-3 py-2 text-center">Aún no hay ventas mensuales registradas este año.</p>`;
              } else {
                  mesesOrdenados.forEach(mesKey => {
                      const montoMes = acumuladoMensual[mesKey];
                      const card = document.createElement('div');
                      card.className = "bg-slate-50 border border-slate-200 p-4 rounded-xl shadow-inner flex flex-col justify-between";
                      card.innerHTML = `
                          <span class="text-xs font-bold text-slate-500 uppercase tracking-wide">${mesKey}</span>
                          <span class="text-lg font-black text-indigo-600 mt-1">${montoMes.toFixed(2)} Bs.</span>
                      `;
                      mensualCardsContainer.appendChild(card);
                  });
              }
          }

          // RENDERIZAR ARQUEO SEMANAL
          const tbodyArqueo = document.getElementById('tableArqueoCajaBody');
          if (tbodyArqueo) {
              tbodyArqueo.innerHTML = '';
              diasSemana.forEach(dia => {
                  const datos = arqueoSemanal[dia];
                  if (datos.total > 0) {
                      const detalleProd = Object.entries(datos.productos)
                          .map(([name, cant]) => `${cant} ${name}`)
                          .join(', ');

                      const tr = document.createElement('tr');
                      tr.className = "hover:bg-slate-50 border-b";
                      tr.innerHTML = `
                          <td class="py-2 px-3 font-bold text-slate-800">${dia}</td>
                          <td class="py-2 px-3 text-[11px] text-slate-500 max-w-[140px] truncate" title="${detalleProd}">${detalleProd}</td>
                          <td class="py-2 px-3 font-bold text-emerald-600">${datos.efectivo.toFixed(2)} Bs.</td>
                          <td class="py-2 px-3 font-bold text-blue-600">${datos.qr.toFixed(2)} Bs.</td>
                          <td class="py-2 px-3 text-right font-black text-slate-900">${datos.total.toFixed(2)} Bs.</td>
                      `;
                      tbodyArqueo.appendChild(tr);
                  }
              });
          }

          // Actualizar etiquetas globales en pantalla
          if(document.getElementById('lblMiTotalHoy')) document.getElementById('lblMiTotalHoy').textContent = `${miTotalHoy.toFixed(2)} Bs.`;
          if(document.getElementById('lblVentasDia')) document.getElementById('lblVentasDia').textContent = `${globalDia.toFixed(2)} Bs.`;
          if(document.getElementById('lblEfecHoy')) document.getElementById('lblEfecHoy').textContent = `${efecHoy.toFixed(2)} Bs.`;
          if(document.getElementById('lblQrHoy')) document.getElementById('lblQrHoy').textContent = `${qrHoy.toFixed(2)} Bs.`;
      }, error => {
          console.error("Error cargando flujo:", error);
      });
}
document.getElementById('btnGuardarUser').addEventListener('click', async () => {
    // 1. Obtenemos los valores
    const name = document.getElementById('regFullName').value;
    const user = document.getElementById('regUsername').value;
    const pass = document.getElementById('regPassword').value;
    const role = document.getElementById('regRole').value;

    // 2. Guardamos en Firebase
    try {
        await db.collection('usuarios').add({
            name: name,
            user: user,
            pass: pass,
            role: role
        });
        
        alert("Usuario guardado con éxito");
        
        // 3. Limpiamos los campos
        document.getElementById('regFullName').value = '';
        document.getElementById('regUsername').value = '';
        document.getElementById('regPassword').value = '';
    } catch (error) {
        alert("Error al guardar: " + error.message);
    }
});
// Este script busca la tabla o la crea automáticamente
db.collection('usuarios').onSnapshot((snapshot) => {
    // 1. Busca si ya existe un tbody, si no, lo busca por un id común
    let tbody = document.querySelector('tbody');
    
    // Si no encuentra el tbody, busca el contenedor de la tabla y le inserta uno
    if (!tbody) {
        const tabla = document.querySelector('table');
        if (tabla) {
            tbody = document.createElement('tbody');
            tabla.appendChild(tbody);
        }
    }

    // 2. Si finalmente tenemos un tbody, lo llenamos
    if (tbody) {
        tbody.innerHTML = ''; // Limpiamos la tabla
        
        snapshot.forEach((doc) => {
            const user = doc.data();
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td class="p-2">${user.name || 'N/A'}</td>
                <td class="p-2">${user.user || 'N/A'}</td>
                <td class="p-2">${user.role || 'N/A'}</td>
                <td class="p-2">
                    <button onclick="db.collection('usuarios').doc('${doc.id}').delete()" class="text-red-500 font-bold">Eliminar</button>
                </td>
            `;
            tbody.appendChild(fila);
        });
    }
});