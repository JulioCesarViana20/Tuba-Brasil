document.addEventListener('DOMContentLoaded', () => {
    const CARRINHO_KEY = 'tubabrasil_carrinho';
    const API_PRODUCTS = '/api/products';
    const API_UPLOAD_IMAGE = '/api/upload-image';

    function formatPreco(valor) {
        return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

   function setAdminFeedback(message, isError = false) {
  const feedbackEl = document.getElementById('admin-login-feedback');
  if (feedbackEl) {
    feedbackEl.textContent = message;
    feedbackEl.style.color = isError ? '#ff4d4d' : '#4caf50';
  }
}

const loginForm = document.getElementById('admin-login-form');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('admin-username').value.trim();
    const password = document.getElementById('admin-password').value.trim();

    if (!username || !password) {
      setAdminFeedback('Por favor, preencha todos os campos corretamente.', true);
      return;
    }

    try {
      // Faz a chamada para a rota de autenticação do seu server.js
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setAdminFeedback('Login realizado com sucesso!');
        // Redireciona para o painel restrito que o server.js gerencia
        setTimeout(() => {
          window.location.href = '/admin';
        }, 600);
      } else {
        setAdminFeedback(data.error || 'Credenciais inválidas.', true);
      }
    } catch (error) {
      setAdminFeedback('Erro ao conectar ao servidor. Tente novamente.', true);
    }
  });
}


    function loadCarrinho() {
        try {
            const raw = localStorage.getItem(CARRINHO_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function saveCarrinho(itens) {
        localStorage.setItem(CARRINHO_KEY, JSON.stringify(itens));
    }

    function updateCartCount() {
        const badge = document.getElementById('cart-count');
        if (!badge) return;

        const total = loadCarrinho().reduce((acc, item) => acc + (item.quantidade || 1), 0);
        badge.textContent = String(total);
        badge.hidden = total === 0;
    }

    async function fetchProducts() {
        try {
            const response = await fetch(API_PRODUCTS);
            const data = await response.json();
            if (!response.ok || !Array.isArray(data.products)) {
                throw new Error(data.error || 'Falha ao buscar produtos.');
            }
            return data.products;
        } catch (error) {
            console.error(error);
            return [];
        }
    }

    function adicionarCarrinho(nome, preco, tamanho) {
        const itens = loadCarrinho();
        const existente = itens.find((item) => item.nome === nome && item.tamanho === tamanho);

        if (existente) {
            existente.quantidade = (existente.quantidade || 1) + 1;
        } else {
            itens.push({ nome, preco, tamanho, quantidade: 1 });
        }

        saveCarrinho(itens);
        updateCartCount();
    }

    function bindReturnButtons() {
        document.querySelectorAll('.return-icon, .return-icon-inline').forEach((el) => {
            el.addEventListener('click', () => {
                window.location.href = 'index.html';
            });
        });
    }

    function renderStoreProducts(products) {
        const container = document.getElementById('products-grid') || document.querySelector('.cards-grid');
        if (!container) return;

        if (!products.length) {
            container.innerHTML = '<article class="card"><h4>Sem produtos no momento</h4><p>Acompanhe nossas redes sociais para mais informações.</p></article>';
            return;
        }

        container.innerHTML = products.map((produto) => {
            const nome = escapeHtml(produto.nome);
            const img = escapeHtml(produto.imagem || 'img/sacolas.png');
            const descricao = escapeHtml(produto.descricao || 'Sem descricao.');
            const preco = Number(produto.preco || 0);
            const tamanhos = Array.isArray(produto.tamanhos) && produto.tamanhos.length ? produto.tamanhos : ['U'];
            const optionsTamanhos = tamanhos.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
            const sizesText = tamanhos.join(', ');

            return `
                <article class="card" data-id="${escapeHtml(produto.id)}">
                    <h4>${nome}</h4>
                    <img src="${img}" class="card-image" alt="${nome}" loading="lazy" decoding="async" width="900" height="1125">
                    <p>Preco: ${formatPreco(preco)}</p>
                    <p>Tamanhos: ${escapeHtml(sizesText)}</p>

                    <label>Tamanho
                        <select class="select-tamanho">
                            ${optionsTamanhos}
                        </select>
                    </label>

                    <details>
                        <summary>Descricao</summary>
                        ${descricao}
                    </details>

                    <button type="button" class="button third" data-add-cart data-nome="${nome}" data-preco="${preco}">
                        Adicionar ao carrinho
                    </button>
                </article>
            `;
        }).join('');

        container.querySelectorAll('[data-add-cart]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const nome = btn.getAttribute('data-nome');
                const preco = parseFloat(btn.getAttribute('data-preco'));
                const selectTamanho = btn.closest('.card').querySelector('.select-tamanho');
                const tamanho = selectTamanho ? selectTamanho.value : 'U';

                if (!nome || Number.isNaN(preco)) return;
                adicionarCarrinho(nome, preco, tamanho);
                alert(`${nome} (tam ${tamanho}) foi adicionado ao carrinho.`);
            });
        });
    }

    function fillAdminForm(product) {
        document.getElementById('product-id').value = product.id || '';
        document.getElementById('product-name').value = product.nome || '';
        document.getElementById('product-price').value = String(product.preco || '');
        document.getElementById('product-sizes').value = Array.isArray(product.tamanhos) ? product.tamanhos.join(', ') : '';
        document.getElementById('product-image').value = product.imagem || '';
        document.getElementById('product-description').value = product.descricao || '';

        const imageFileInput = document.getElementById('product-image-file');
        if (imageFileInput) {
            imageFileInput.value = '';
        }
    }

    function resetAdminForm() {
        const form = document.getElementById('product-form');
        if (form) form.reset();
        const idInput = document.getElementById('product-id');
        if (idInput) idInput.value = '';

        const imagePathInput = document.getElementById('product-image');
        if (imagePathInput) imagePathInput.value = '';
    }

    function getAdminFeedbackElement() {
        return document.getElementById('admin-feedback');
    }

    function setAdminFeedback(message, isError = false) {
        const feedback = getAdminFeedbackElement();
        if (!feedback) return;
        feedback.textContent = message;
        feedback.style.color = isError ? '#ad1732' : '#073bc4';
    }

    function collectAdminFormPayload() {
        return {
            nome: document.getElementById('product-name').value,
            preco: Number(document.getElementById('product-price').value),
            tamanhos: document.getElementById('product-sizes').value.split(',').map((s) => s.trim()).filter(Boolean),
            imagem: document.getElementById('product-image').value,
            descricao: document.getElementById('product-description').value,
        };
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'));
            reader.readAsDataURL(file);
        });
    }

    async function uploadImageFromFile(file) {
        const dataUrl = await fileToDataUrl(file);

        const response = await fetch(API_UPLOAD_IMAGE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileName: file.name,
                dataUrl,
            }),
        });

        const data = await response.json();
        if (!response.ok || !data.imagePath) {
            throw new Error(data.error || 'Nao foi possivel enviar a imagem.');
        }

        return data.imagePath;
    }

    function bindImagePicker() {
        const fileInput = document.getElementById('product-image-file');
        const imagePathInput = document.getElementById('product-image');
        if (!fileInput || !imagePathInput) return;

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;

            setAdminFeedback('Enviando imagem...');

            try {
                const imagePath = await uploadImageFromFile(file);
                imagePathInput.value = imagePath;
                setAdminFeedback('Imagem enviada com sucesso.');
            } catch (error) {
                imagePathInput.value = '';
                setAdminFeedback(error.message || 'Erro no upload da imagem.', true);
            }
        });
    }

    function renderAdminTable(products) {
        const tbody = document.getElementById('admin-products-body');
        if (!tbody) return;

        if (!products.length) {
            tbody.innerHTML = '<tr><td colspan="4">Nenhum produto cadastrado.</td></tr>';
            return;
        }

        tbody.innerHTML = products.map((product) => `
            <tr>
                <td>
                    <strong>${escapeHtml(product.nome)}</strong><br>
                    <small>${escapeHtml(product.imagem || '')}</small>
                </td>
                <td>${formatPreco(product.preco)}</td>
                <td>${escapeHtml((product.tamanhos || []).join(', '))}</td>
                <td>
                    <div class="admin-actions">
                        <button class="btn btn-ghost" data-action="edit" data-id="${escapeHtml(product.id)}" type="button">Editar</button>
                        <button class="btn btn-danger" data-action="delete" data-id="${escapeHtml(product.id)}" type="button">Excluir</button>
                    </div>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('[data-action="edit"]').forEach((button) => {
            button.addEventListener('click', () => {
                const id = button.getAttribute('data-id');
                const product = products.find((item) => item.id === id);
                if (!product) return;
                fillAdminForm(product);
                setAdminFeedback('Modo de edicao ativo. Altere os campos e clique em salvar.');
            });
        });

        tbody.querySelectorAll('[data-action="delete"]').forEach((button) => {
            button.addEventListener('click', async () => {
                const id = button.getAttribute('data-id');
                if (!id) return;

                const confirmed = window.confirm('Deseja excluir este produto?');
                if (!confirmed) return;

                try {
                    const response = await fetch(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Nao foi possivel excluir.');

                    setAdminFeedback('Produto excluido com sucesso.');
                    await mountAdminPage();
                } catch (error) {
                    setAdminFeedback(error.message || 'Erro ao excluir produto.', true);
                }
            });
        });
    }

    async function mountAdminPage() {
        const products = await fetchProducts();
        renderAdminTable(products);
    }

    function bindAdminForm() {
        const form = document.getElementById('product-form');
        if (!form) return;

        bindImagePicker();

        const cancelButton = document.getElementById('cancel-edit-btn');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                resetAdminForm();
                setAdminFeedback('Formulario limpo.');
            });
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const currentId = document.getElementById('product-id').value;
            const payload = collectAdminFormPayload();

            try {
                const response = await fetch(currentId ? `/api/products/${encodeURIComponent(currentId)}` : '/api/products', {
                    method: currentId ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Nao foi possivel salvar o produto.');

                resetAdminForm();
                setAdminFeedback(currentId ? 'Produto atualizado com sucesso.' : 'Produto criado com sucesso.');
                await mountAdminPage();
            } catch (error) {
                setAdminFeedback(error.message || 'Erro ao salvar produto.', true);
            }
        });
    }

    function renderCartPage() {
        const listEl = document.getElementById('cart-list');
        const emptyEl = document.getElementById('cart-empty');
        const filledEl = document.getElementById('cart-filled');
        const subtotalEl = document.getElementById('cart-subtotal');
        const totalEl = document.getElementById('cart-total');
        if (!listEl || !emptyEl || !filledEl) return;

        const itens = loadCarrinho();
        updateCartCount();
        const temItens = itens.length > 0;

        emptyEl.hidden = temItens;
        filledEl.hidden = !temItens;

        if (!temItens) {
            listEl.innerHTML = '';
            return;
        }

        let subtotal = 0;
        listEl.innerHTML = itens.map((item, index) => {
            const q = item.quantidade || 1;
            const linha = Number(item.preco || 0) * q;
            subtotal += linha;
            const nomeEsc = escapeHtml(item.nome || 'Produto');

            return `
                <li class="cart-item" data-index="${index}">
                    <div class="cart-item-info">
                        <span class="cart-item-name">${nomeEsc}</span>
                        <span class="cart-item-tamanho">Tam: ${escapeHtml(item.tamanho || 'Unico')}</span>
                        <span class="cart-item-unit">${formatPreco(item.preco)} <span class="cart-item-each">cada</span></span>
                    </div>
                    <div class="cart-item-actions">
                        <div class="cart-qty" role="group" aria-label="Quantidade de ${nomeEsc}">
                            <button type="button" class="cart-qty-btn" data-action="dec" data-index="${index}" aria-label="Diminuir">-</button>
                            <span class="cart-qty-value">${q}</span>
                            <button type="button" class="cart-qty-btn" data-action="inc" data-index="${index}" aria-label="Aumentar">+</button>
                        </div>
                        <span class="cart-item-line">${formatPreco(linha)}</span>
                        <button type="button" class="cart-remove" data-action="remove" data-index="${index}" aria-label="Remover item">Remover</button>
                    </div>
                </li>
            `;
        }).join('');

        if (subtotalEl) subtotalEl.textContent = formatPreco(subtotal);
        if (totalEl) totalEl.textContent = formatPreco(subtotal);

        listEl.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                const action = btn.getAttribute('data-action');
                const novo = loadCarrinho();
                if (Number.isNaN(idx) || idx < 0 || idx >= novo.length) return;

                if (action === 'remove') {
                    novo.splice(idx, 1);
                } else if (action === 'inc') {
                    novo[idx].quantidade = (novo[idx].quantidade || 1) + 1;
                } else if (action === 'dec') {
                    const novaQuantidade = (novo[idx].quantidade || 1) - 1;
                    if (novaQuantidade <= 0) {
                        novo.splice(idx, 1);
                    } else {
                        novo[idx].quantidade = novaQuantidade;
                    }
                }

                saveCarrinho(novo);
                renderCartPage();
            });
        });
    }

    async function gerarPagamentoPix() {
        const itens = loadCarrinho();
        if (itens.length === 0) {
            alert('Seu carrinho esta vazio. Adicione produtos antes de gerar o pagamento.');
            return;
        }

        const btnPix = document.getElementById('btn-pix');
        const pixResultEl = document.getElementById('pix-payment-result');

        if (btnPix) {
            btnPix.disabled = true;
            btnPix.textContent = 'Gerando Pix...';
        }

        try {
            const response = await fetch('/api/create-pix-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itens }),
            });

            const data = await response.json();
            if (!response.ok || !data.qrCode) {
                throw new Error(data.error || 'Nao foi possivel gerar o pagamento por Pix.');
            }

            if (pixResultEl) {
                pixResultEl.hidden = false;
                pixResultEl.innerHTML = `
                    <h3>Pague com Pix</h3>
                    <p>Escaneie o QR Code abaixo ou use o codigo para pagar.</p>
                    <div class="pix-qr-box">
                        <img src="data:image/png;base64,${data.qrCodeBase64}" alt="QR Code do Pix">
                    </div>
                    <p><strong>Codigo Pix:</strong></p>
                    <textarea readonly>${escapeHtml(data.qrCode)}</textarea>
                    <p><small>Valor: ${formatPreco(data.transactionAmount || 0)}</small></p>
                `;
            }

            alert('Pix criado com sucesso.');
        } catch (error) {
            console.error(error);
            alert(`Nao foi possivel gerar o Pix. ${error.message}`);
        } finally {
            if (btnPix) {
                btnPix.disabled = false;
                btnPix.textContent = 'Pagar com Pix';
            }
        }
    }

    function bindCheckoutButtons() {
        const btnLimpar = document.getElementById('btn-limpar');
        if (btnLimpar) {
            btnLimpar.addEventListener('click', () => {
                saveCarrinho([]);
                updateCartCount();
                renderCartPage();
            });
        }

        const btnPix = document.getElementById('btn-pix');
        if (btnPix) {
            btnPix.addEventListener('click', gerarPagamentoPix);
        }

        const btnFinalizar = document.getElementById('btn-finalizar');
        if (!btnFinalizar) return;

        const textoOriginal = btnFinalizar.textContent;
        btnFinalizar.addEventListener('click', async () => {
            const itens = loadCarrinho();
            if (itens.length === 0) {
                alert('Seu carrinho esta vazio.');
                return;
            }

            btnFinalizar.disabled = true;
            btnFinalizar.textContent = 'Criando pagamento...';

            try {
                const response = await fetch('/api/create-preference', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itens }),
                });

                const data = await response.json();
                if (!response.ok || !data.init_point) {
                    throw new Error(data.error || 'Nao foi possivel iniciar o pagamento.');
                }

                window.location.href = data.init_point;
            } catch (error) {
                console.error(error);
                alert(`Nao foi possivel abrir o checkout. ${error.message}`);
            } finally {
                btnFinalizar.disabled = false;
                btnFinalizar.textContent = textoOriginal;
            }
        });
    }

    async function bootstrap() {
        bindReturnButtons();
        updateCartCount();

        if (document.body.classList.contains('cart-page')) {
            renderCartPage();
            bindCheckoutButtons();
            return;
        }

        if (document.body.classList.contains('admin-page')) {
            bindAdminForm();
            await mountAdminPage();
            return;
        }

        const products = await fetchProducts();
        renderStoreProducts(products);
    }

    bootstrap();
});
