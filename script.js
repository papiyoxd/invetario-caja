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

// ==========================================
// VARIABLES GLOBALES Y ESTADO
// ==========================================
let currentUser = null;
let carrito = [];
let productosGlobales = [];

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
const btnMobileLogout = document.getElementById('btnMobileLogout');

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

        if(window.innerWidth < 768) {
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
            inicializarFormularioAbastecimiento(); // Activamos el nuevo módulo
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
if (btnMobileLogout) {
    btnMobileLogout.addEventListener('click', cerrarSesionSistema);
}

// ==========================================
// GESTIÓN Y RENDERIZADO DE PRODUCTOS
// ==========================================
async function cargarProductos() {
    try {
        db.collection('productos').onSnapshot(snapshot => {
            productosGlobales = [];
            productsGrid.innerHTML = '';
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (!data.name || data.price === undefined) {
                    return; 
                }

                const prod = { id: doc.id, ...data };
                productosGlobales.push(prod);
                renderizarTarjetaProducto(prod);
            });
            
            renderizarTablaAdministracionInventario();
            actualizarSelectAbastecimiento(); // Rellena la lista de opciones para sumar stock
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
// ELIMINAR PRODUCTOS (ADMIN)
// ==========================================
window.eliminarProductoDelSistema = async function(id, nombre) {
    if (confirm(`¿Estás seguro de que quieres eliminar "${nombre}" del inventario?`)) {
        try {
            await db.collection('productos').doc(id).delete();
            alert("Producto eliminado correctamente.");
        } catch (error) {
            console.error("Error al eliminar producto:", error);
            alert("No se pudo eliminar el producto.");
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
            <td class="px-4 py-2 font-black text-emerald-600">${prod.stock} u</td>
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
        const fileInput = document.getElementById('prodImage');

        if (!name || isNaN(price) || isNaN(stock)) {
            alert("Por favor completa los campos correctamente.");
            if (btnSubmit) btnSubmit.disabled = false;
            return;
        }

        try {
            let imageUrl = "";

            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const storageRef = storage.ref(`productos/${Date.now()}_${file.name}`);
                const uploadTask = await storageRef.put(file);
                imageUrl = await uploadTask.ref.getDownloadURL();
            }

            await db.collection('productos').add({
                name: name,
                price: price,
                stock: stock,
                category: category,
                imageUrl: imageUrl,
                fechaCreacion: firebase.firestore.Timestamp.now()
            });

            alert("¡Producto agregado con éxito!");
            cleanProductForm.reset();
        } catch (error) {
            console.error("Error al guardar producto:", error);
            alert("Ocurrió un error al guardar el producto.");
        } finally {
            if (btnSubmit) btnSubmit.disabled = false;
        }
    });
}

// ==========================================
// NUEVO: CONTROL DEL MÓDULO DE ABASTECIMIENTO (RE-STOCK)
// ==========================================
function actualizarSelectAbastecimiento() {
    const select = document.getElementById('restockProductSelect');
    if (!select) return;

    // Guardamos la opción seleccionada antes de actualizar la lista para no entorpecer al usuario
    const seleccionPrevia = select.value;

    select.innerHTML = '<option value="">-- Selecciona un Producto --</option>';
    
    // Ordenamos los productos alfabéticamente para que Roberto los encuentre rápido
    const ordenados = [...productosGlobales].sort((a,b) => a.name.localeCompare(b.name));
    
    ordenados.forEach(prod => {
        const option = document.createElement('option');
        option.value = prod.id;
        option.textContent = `${prod.name} (Tiene actual: ${prod.stock} u)`;
        select.appendChild(option);
    });

    if (seleccionPrevia) {
        select.value = seleccionPrevia;
    }
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

        if (!prodId || isNaN(cantAAgregar) || cantAAgregar <= 0) {
            alert("Por favor selecciona un producto y pon una cantidad válida.");
            return;
        }

        const productoElegido = productosGlobales.find(p => p.id === prodId);
        if (!productoElegido) return;

        try {
            const prodRef = db.collection('productos').doc(prodId);
            
            // Usamos una transacción para sumar de forma completamente segura en la base de datos
            await db.runTransaction(async (transaction) => {
                const sfDoc = await transaction.get(prodRef);
                if (!sfDoc.exists) {
                    throw "El producto ya no existe.";
                }
                const stockActual = sfDoc.data().stock || 0;
                const nuevoStockCalculado = stockActual + cantAAgregar;
                
                transaction.update(prodRef, { stock: nuevoStockCalculado });
            });

            // Mostrar el toast verde de éxito
            toastSuccess.classList.add('show');
            setTimeout(() => { toastSuccess.classList.remove('show'); }, 3000);

            cleanForm.reset();
        } catch (error) {
            console.error("Error al abastecer stock:", error);
            alert("Ocurrió un error al intentar actualizar el stock.");
        }
    });
}

// ==========================================
// GESTIÓN DEL CARRITO (VENTA LIBRE SIN CONTROL DE BLOQUEO)
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
// PROCESAR FACTURACIÓN
// ==========================================
btnPay.addEventListener('click', async () => {
    if (carrito.length === 0) return;

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

        for (const item of carrito) {
            const prodRef = db.collection('productos').doc(item.id);
            await db.runTransaction(async (transaction) => {
                const sfDoc = await transaction.get(prodRef);
                if (!sfDoc.exists) return;
                const nuevoStock = sfDoc.data().stock - item.cantidad;
                transaction.update(prodRef, { stock: nuevoStock }); // Nota: Puede irse a números negativos si vendes sin stock previo
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
// REGRESO DEL FLUJO DE HOY Y ARQUEO DE CAJA
// ==========================================
function cargarFlujoHoy() {
    const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const inicioHoy = new Date();
    inicioHoy.setHours(0,0,0,0);

    const haceSieteDias = new Date();
    haceSieteDias.setDate(haceSieteDias.getDate() - 7);
    haceSieteDias.setHours(0,0,0,0);

    db.collection('ventas')
      .where('fecha', '>=', haceSieteDias)
      .orderBy('fecha', 'desc')
      .onSnapshot(snapshot => {
          
          const tbodyFlujo = document.getElementById('tableCajeroPersonalBody');
          if (tbodyFlujo) {
              tbodyFlujo.innerHTML = '';
          }

          let miTotalHoy = 0;
          let globalDia = 0;
          let efecHoy = 0, qrHoy = 0;

          const arqueoSemanal = {};
          diasSemana.forEach(d => {
              arqueoSemanal[d] = { total: 0, efectivo: 0, qr: 0, productos: {} };
          });

          snapshot.forEach(doc => {
              const v = doc.data();
              const fechaVenta = v.fecha ? v.fecha.toDate() : new Date();
              const nombreDia = diasSemana[fechaVenta.getDay()];

              if (v.monto) {
                  arqueoSemanal[nombreDia].total += v.monto;
                  if (v.pago === 'Efectivo') arqueoSemanal[nombreDia].efectivo += v.monto;
                  if (v.pago === 'QR') arqueoSemanal[nombreDia].qr += v.monto;

                  if (v.itemsDetallados && Array.isArray(v.itemsDetallados)) {
                      v.itemsDetallados.forEach(it => {
                          if (!arqueoSemanal[nombreDia].productos[it.name]) {
                              arqueoSemanal[nombreDia].productos[it.name] = 0;
                          }
                          arqueoSemanal[nombreDia].productos[it.name] += it.cantidad;
                      });
                  }
              }

              if (fechaVenta >= inicioHoy) {
                  globalDia += v.monto;
                  if (v.cajero === currentUser.user) {
                      miTotalHoy += v.monto;
                  }
                  if (v.pago === 'Efectivo') efecHoy += v.monto;
                  if (v.pago === 'QR') qrHoy += v.monto;

                  const hora = v.fecha ? v.fecha.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

                  if (tbodyFlujo) {
                      const tr = document.createElement('tr');
                      tr.innerHTML = `
                          <td class="py-2.5 px-3"><span class="font-bold text-slate-600">${hora}</span></td>
                          <td class="py-2.5 px-3 text-slate-700">${v.cajero}</td>
                          <td class="py-2.5 px-3 max-w-[150px] truncate text-slate-600 font-medium">${v.items}</td>
                          <td class="py-2.5 px-3">
                              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${v.servicio === 'Mesa' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'}">
                                  ${v.servicio}
                              </span>
                          </td>
                          <td class="py-2.5 px-3">
                              <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${v.pago === 'QR' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}">
                                  ${v.pago}
                              </span>
                          </td>
                          <td class="py-2.5 px-3 text-right font-black text-slate-800">${v.monto.toFixed(2)} Bs.</td>
                      `;
                      tbodyFlujo.appendChild(tr);
                  }
              }
          });

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
                          <td class="py-3 px-4 font-bold text-slate-800">${dia}</td>
                          <td class="py-3 px-4 text-xs text-slate-500 max-w-[200px] truncate" title="${detalleProd}">${detalleProd}</td>
                          <td class="py-3 px-4 font-bold text-emerald-600">${datos.efectivo.toFixed(2)} Bs.</td>
                          <td class="py-3 px-4 font-bold text-blue-600">${datos.qr.toFixed(2)} Bs.</td>
                          <td class="py-3 px-4 text-right font-black text-slate-900">${datos.total.toFixed(2)} Bs.</td>
                      `;
                      tbodyArqueo.appendChild(tr);
                  }
              });
          }

          if(document.getElementById('lblMiTotalHoy')) document.getElementById('lblMiTotalHoy').textContent = `${miTotalHoy.toFixed(2)} Bs.`;
          if(document.getElementById('lblVentasDia')) document.getElementById('lblVentasDia').textContent = `${globalDia.toFixed(2)} Bs.`;
          if(document.getElementById('lblEfecHoy')) document.getElementById('lblEfecHoy').textContent = `${efecHoy.toFixed(2)} Bs.`;
          if(document.getElementById('lblQrHoy')) document.getElementById('lblQrHoy').textContent = `${qrHoy.toFixed(2)} Bs.`;
      });
}