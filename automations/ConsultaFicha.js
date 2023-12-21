const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
const fs = require('fs').promises;
require('dotenv').config({ path: '../constants/.env' });

const Tab = require('../modules/Pup_modules/tab');
const Delay = require('../modules/Pup_modules/delay');
const DeathCaptcha = require('../modules/DeathByCaptcha/death');

// Funçao de ler Excel e armazenar apenas a primeia coluna
function LerExcel(caminhoArquivo) {
    const workbook = XLSX.readFile(caminhoArquivo);
    const sheetName = workbook.SheetNames[0]; // Assume que os dados estão na primeira aba
    const sheet = workbook.Sheets[sheetName];

    const dados = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Converte a aba em um array de arrays
    return dados.map(row => [row[0], row[1], row[2]]); // Retorna as três primeiras colunas de cada linha
}

function salvarDadosExcel(dados) {
    const headers = ['Placa', 'Status', 'N° da Ficha', 'Ano Ficha', 'Renavam', 'Chassi', 'Placa', 'Município', 'Despachante', 'Status Registro', 'Retorno Consistência', 'Opção', 'Inclusão da Ficha'];
    let worksheet = XLSX.utils.aoa_to_sheet([headers]);
    dados.forEach(dado => {
        const row = Object.values(dado);
        XLSX.utils.sheet_add_aoa(worksheet, [row], { origin: -1 });
    });
    let workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");
    XLSX.writeFile(workbook, '../Retorno/FichaCadastral Retorno.xlsx');
}

// Variáveis para dialog gerais
let dialogAction = 'dismiss';
let lastDialogMessage = '';

// Função de login
async function realizarLoginEVerificacoes(frameBody, CPF, SENHA) {

    // Parte do código que você quer repetir
    await frameBody.waitForSelector('.modal-footer .btn-primary', { visible: true });
    await frameBody.waitForSelector('#notificacoes > div > div > div.modal-footer > div > div.col-sm-4 > button');
    await frameBody.evaluate(() => document.querySelector('.modal-footer .btn-primary').click());
    await Delay(4000);

    // Digita acessos
    await frameBody.waitForSelector('#cpf');
    await frameBody.type('#cpf', CPF);
    await frameBody.waitForSelector('#senha');
    await frameBody.type('#senha', SENHA);

    // Inicia um ouvinte de 'alert' para negar
    dialogAction = 'dismiss';

    // Clica para acessar
    await frameBody.evaluate(() => document.querySelector('#conteudo > div.container.container-home > div > div.col-sm-3 > div > div.panel-body > button').click());
    await Delay(2000);

    // Confirma o aviso de Informação
    await frameBody.waitForSelector('#notificacoes > div > div > div.modal-footer > div > div.col-sm-4 > button');
    await frameBody.evaluate(() => document.querySelector('.modal-footer .btn-primary').click());
}

async function consultaECRV() {
    let browser
    let page
    let todosOsDados
    try {
        // Variáveis necessárias
        const CPF = process.env.CPF
        const SENHA = process.env.SENHA
        const linkECRV = 'https://www.e-crvsp.sp.gov.br/'

        // Armazenando dados do Excel
        const DadosDoExcel = LerExcel('../ECRV.xlsx');

        browser = await puppeteer.launch({
            headless: false,
            protocolTimeout: 90000
        });
        page = await browser.newPage();

        const cookiesString = await fs.readFile('./cookies.json');
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies)
        
        await page.goto(linkECRV, { waitUntil: 'networkidle2' })

        // Ativa percepção de dialogs, com condições
        page.on('dialog', async dialog => {
            lastDialogMessage = dialog.message();
            if (dialogAction === 'dismiss') {
                await dialog.dismiss();
            } else if (dialogAction === 'accept') {
                await dialog.accept();
            }
        });


        // Seleciona o Frame da página
        let frameBody = page.frames().find(frame => frame.name() === 'body');

        // Caso o Frame esteja disponível
        if (frameBody) {

            try {
                await frameBody.waitForFunction(
                    text => document.body.innerText.includes(text),
                    {},
                    'Bem-vindo(a) ao e-CRVsp!'
                );
            } catch (error) {
                // Login no e-CRV
                await realizarLoginEVerificacoes(frameBody, CPF, SENHA);

                // Condições para saber se há uma sessão aberta
                const frameExterno = await page.waitForFrame(frame => frame.name() === 'GB_frame');

                if (frameExterno) {
                    // Aguarda pelo carregamento do iframe interno GB_frame
                    const frameInterno = await new Promise(resolve => {
                        frameExterno.waitForSelector('iframe#GB_frame').then(async () => {
                            const handleIframeInterno = await frameExterno.$('iframe#GB_frame');
                            const frameInterno = await handleIframeInterno.contentFrame();
                            resolve(frameInterno);
                        });
                    });

                    // Caso o iframe interno tenha sido encontrado
                    if (frameInterno) {
                        // Procura o texto "Já existe uma sessão aberta."
                        const sessaoAberta = await frameInterno.evaluate(() => {
                            const elemento = document.querySelector('h4');
                            return elemento && elemento.textContent.includes('Já existe uma sessão aberta.');
                        });

                        // Caso tenha uma sessão aberta
                        if (sessaoAberta) {
                            // Tendo uma sessão aberta, vai até "Encerrar sessões"
                            await Tab(page, 13)
                            await page.keyboard.press('Enter')
                            await Delay(5000)
                            // Retira novo frame
                            let frameBody = page.frames().find(frame => frame.name() === 'body');
                            // Login no e-CRV
                            await realizarLoginEVerificacoes(frameBody, CPF, SENHA);
                            // Autenticação de Certificado
                            await Tab(page, 13)
                            await page.keyboard.press('Enter')
                        } else {
                            // Não existe sessão aberta
                            // Autenticação de Certificado
                            await Tab(page, 13)
                            await page.keyboard.press('Enter')
                        }
                    } else {
                        console.log("Iframe interno 'GB_frame' não encontrado.");
                    }
                } else {
                    console.log("Iframe externo 'GB_frame' não encontrado.");
                }

            }


            await Delay(5000)

            // Retira novo frame
            frameBody = page.frames().find(frame => frame.name() === 'body');

            // Condiçao para Login Excedido
            if (lastDialogMessage.includes('QUANTIDADE')) {
                console.log('Quantidade diária de login excedida.')
                await browser.close()
                return;
            }

            // Espera o texto de 'Bem-vindo' aparecer na tela
            await frameBody.waitForFunction(
                text => document.body.innerText.includes(text),
                {},
                'Bem-vindo(a) ao e-CRVsp!'
            );

            // Pega Cookies para o Andamento
            const cookies = await page.cookies();
            await fs.writeFile('./cookies.json', JSON.stringify(cookies, null, 2));

            // Clica no menu dropdown
            await frameBody.evaluate(() => {
                Array.from(document.querySelectorAll('.list-group-item a.dropdown-toggle')).find(el => el.textContent.includes('Processos')).click();
            });
            await Delay(1000)

            // Espera e Clica na opção do menu dropdown
            await frameBody.waitForFunction(
                text => document.body.innerText.includes(text),
                {},
                'Consultar Ficha Cadastral'
            );
            await frameBody.evaluate(() => {
                Array.from(document.querySelectorAll('.list-group-item-sub.dropdown a')).find(el => el.textContent.includes('Consultar Ficha Cadastral')).click();
            });

            // Espera o campo carregar
            await frameBody.waitForSelector('.campos_upper')

            // Aceita possível dialog
            dialogAction = 'accept';

            // Instancia array que receberá os dados das placas
            todosOsDados = [];

            // Loop para pesquisa e obtençao dos dados da placa
            placaLoop: for (i = 1; i < DadosDoExcel.length; i++) {
                // Pega valor da placa
                let placa = DadosDoExcel[i][0]
                // Validador de Captcha
                let captchaCorreto = false;

                // Espera o campo carregar
                await frameBody.waitForSelector('.campos_upper')

                // Condiçao para Captcha correto
                while (!captchaCorreto) {
                    // Limpa o campo da Placa para evitar erro nos loops
                    await frameBody.evaluate(() => {
                        document.querySelector('.campos_upper').value = '';
                    });
                    // Insere a placa e tira um screenshot do captcha
                    await frameBody.type('.campos_upper', placa);
                    await page.screenshot({ path: '../imageCaptcha/captcha.png', clip: { x: 230, y: 361, width: 225, height: 73 } });

                    // Resolve o captcha e insere a resposta
                    let captcha = await DeathCaptcha('../imageCaptcha/captcha.png');
                    await frameBody.type('#captchaResponse', captcha);

                    // Clica no botão de pesquisa
                    await frameBody.evaluate(() => {
                        document.querySelector('.bt_pesquisar').click();
                    });

                    try {
                        // Espera pelo texto indicativo de sucesso
                        await frameBody.waitForFunction(
                            text => document.body.innerText.includes(text),
                            { timeout: 5000 }, // Tempo de espera antes de considerar falha no captcha
                            'DADOS DA FICHA CADASTRAL'
                        );
                        // Troca o bool para que saia do While
                        captchaCorreto = true;
                        console.log(`Dados da placa ${placa} retirados.`)
                    } catch (error) {
                        // Se o texto não for encontrado, o loop tentará novamente
                        // Valida o tipo de mensagem do dialog, pois pode ser erro de captcha ou de Placa inexistente
                        if (lastDialogMessage.includes('PLACA')) {
                            console.log(`A placa ${placa} é inválida.`)
                            // Insere a placa e o status inválida no Array
                            todosOsDados.push({ "Placa": placa, 'Status': 'Inválido' })
                            captchaCorreto = false;
                            continue placaLoop;
                        } else if (lastDialogMessage.includes('IMAGE')) {
                            console.log("Captcha incorreto, tentando novamente...");
                            captchaCorreto = false;
                        }

                    }
                }

                // Espera a classe dos dados aparecer
                await frameBody.waitForSelector('.texto_menor')

                // Retira todos os valores que está na tabela e atribuiu a variável de forma JSON
                const dadosTabela = await frameBody.evaluate(() => {
                    const dados = {};
                    const fieldsets = document.querySelectorAll('fieldset');

                    fieldsets.forEach(fieldset => {
                        const linhas = fieldset.querySelectorAll('table tr');

                        linhas.forEach(linha => {
                            const colunas = linha.querySelectorAll('td');
                            colunas.forEach((coluna, index) => {
                                // Verifica se a coluna atual contém uma chave
                                const chave = coluna.querySelector('.texto_black2')?.innerText.trim();
                                if (chave) {
                                    // O valor corresponde à próxima célula
                                    const valor = colunas[index + 1]?.querySelector('.texto_menor')?.innerText.trim();
                                    if (valor) {
                                        dados[chave] = valor;
                                    } else {
                                        dados[chave] = ''
                                    }
                                }
                            });
                        });
                    });

                    return dados;
                });

                // Insere os dados retirados no array
                todosOsDados.push({ 'placa': placa, 'Status': 'Válido', ...dadosTabela });
                await Delay(5000)
                // Clica no voltar para reiniciar o Loop
                await frameBody.evaluate(() => {
                    document.querySelector('#tabBotoes > tbody > tr > td > a.bt_voltar').click();
                });
            }

            salvarDadosExcel(todosOsDados)
        }

        await browser.close()

    } catch (e) {

        salvarDadosExcel(todosOsDados)

        await page.screenshot({ path: '../Z-Erro-CF.png' })

        await browser.close()
        console.log("Erro inesperado durante o processo: " + e)
    }
}



consultaECRV()