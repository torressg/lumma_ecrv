const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
const fs = require('fs').promises;
require('dotenv').config({ path: '../constants/.env' });

const Tab = require('../modules/Pup_modules/tab');
const Delay = require('../modules/Pup_modules/delay');
const DeathCaptcha = require('../modules/DeathByCaptcha/death');

// Funçao de ler Excel e armazenar apenas a primeia coluna
function readExcelFile() {
    // Ler o arquivo
    const workbook = XLSX.readFile('../ECRV.xlsx');

    // Pegar o nome da primeira planilha
    const sheetName = workbook.SheetNames[0];

    // Converter a planilha para JSON
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    return json;
}

function salvarDadosExcel(dados) {
    const headers = ['N da Ficha', 'Ano Ficha', 'Renavam', 'Chassi', 'Placa', 'Município', 'Despachante', 'Opção', 'Status Registro', 'Retorno Consistência', 'Retorno da BIN', 'Inclusão', 'Emissão Documento', 'Inclusão Histórico', 'Código', 'Status', 'Data', 'Local', 'Status', 'Motivo da Reprovação', 'Classificaçao Reprovaçao', 'Documentos'];
    let worksheet = XLSX.utils.aoa_to_sheet([headers]);
    dados.forEach(dado => {
        const row = Object.values(dado);
        XLSX.utils.sheet_add_aoa(worksheet, [row], { origin: -1 });
    });
    let workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");
    XLSX.writeFile(workbook, '../Retorno/AndamentoProcesso Retorno.xlsx');
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

async function ProcessoECRV() {
    let browser
    let page
    let todosOsDados
    try {
        // Variáveis necessárias
        const CPF = process.env.CPF
        const SENHA = process.env.SENHA
        const linkECRV = 'https://www.e-crvsp.sp.gov.br/'

        // Armazenando dados do Excel
        const DadosDoExcel = readExcelFile();

        browser = await puppeteer.launch({
            headless: false,
            protocolTimeout: 90000
        });
        page = await browser.newPage();

        const cookiesString = await fs.readFile('./cookies.json');
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);

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

            // Login
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

            const cookies = await page.cookies();
            await fs.writeFile('./cookies.json', JSON.stringify(cookies, null, 2));
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

            frameBody = page.frames().find(frame => frame.name() === 'body');

            if (frameBody) {
                await Delay(2000)
                // Clica no menu dropdown
                await frameBody.evaluate(() => {
                    Array.from(document.querySelectorAll('.list-group-item a.dropdown-toggle')).find(el => el.textContent.includes('Processos')).click();
                });
                await Delay(2000)
                // Espera e Clica na opção do menu dropdown
                await frameBody.waitForFunction(
                    text => document.body.innerText.includes(text),
                    {},
                    'Andamento do Processo'
                );

                frameBody.waitForNavigation()

                await frameBody.evaluate(() => {
                    Array.from(document.querySelectorAll('.list-group-item-sub.dropdown a')).find(el => el.textContent.includes('Andamento do Processo')).click();
                });
                await Delay(2000)
                await frameBody.waitForFunction(
                    text => document.body.innerText.includes(text),
                    {},
                    'Andamento Ficha Cadastral'
                );

                frameBody.waitForNavigation()
                frameBody = page.frames().find(frame => frame.name() === 'body');

                todosOsDados = [];

                processoLoop: for (i = 0; i < DadosDoExcel.length; i++) {
                    let ficha = (DadosDoExcel[i]['FICHA']).toString()
                    let ano = (DadosDoExcel[i]['ANO']).toString()

                    // Validador de Captcha
                    let captchaCorreto = false;

                    frameBody = page.frames().find(frame => frame.name() === 'body');

                    await frameBody.waitForSelector('.campos_upper')

                    frameBody = page.frames().find(frame => frame.name() === 'body');

                    // Condiçao para Captcha correto
                    await Tab(page, 19)
                    await Delay(2000)
                    await page.keyboard.down('Control')
                    await page.keyboard.down('A')
                    await page.keyboard.up('Control')
                    await page.keyboard.up('A')
                    await page.keyboard.press('Backspace')
                    await frameBody.type('#bloco2 > table > tbody > tr:nth-child(1) > td > input', ficha);
                    await Delay(2000)
                    await frameBody.type('.campos', ano)

                    while (!captchaCorreto) {

                        await page.screenshot({
                            path: '../imageCaptcha/captcha2.png',
                            clip: { x: 233, y: 444, width: 210, height: 57 }
                        })
                        let captcha = await DeathCaptcha('../imageCaptcha/captcha2.png');
                        await frameBody.type('#captchaResponse', captcha.toUpperCase());
                        // Clica no botão de pesquisa
                        await frameBody.evaluate(() => {
                            document.querySelector('.bt_pesquisar').click();
                        });

                        try {
                            // Espera pelo texto indicativo de sucesso
                            await frameBody.waitForFunction(
                                text => document.body.innerText.includes(text),
                                { timeout: 5000 }, // Tempo de espera antes de considerar falha no captcha
                                'ANDAMENTO DO PROCESSO'
                            );
                            // Troca o bool para que saia do While
                            captchaCorreto = true;
                            console.log(`Dados da ficha ${ficha} retirados.`)
                        } catch (error) {
                            // Se o texto não for encontrado, o loop tentará novamente
                            // Valida o tipo de mensagem do dialog, pois pode ser erro de captcha ou de Placa inexistente
                            if (lastDialogMessage.includes('CADASTRO')) {
                                console.log(`A ficha ${ficha} é inválida.`)
                                // Insere a placa e o status inválida no Array
                                todosOsDados.push({
                                    'N° da Ficha': ficha,
                                    'Ano Ficha': '',
                                    Renavam: '',
                                    Chassi: '',
                                    Placa: '',
                                    'Município': '',
                                    Despachante: '',
                                    'Opção': '',
                                    'Status Registro': '',
                                    'Retorno Consistência': "",
                                    'Retorno da BIN': '',
                                    'Inclusão': '',
                                    'Emissão Documento': '',
                                    'Inclusão Histórico': '',
                                    'Código Segurança CRV:': '',
                                    Status: 'Inválido'
                                })
                                captchaCorreto = false;
                                continue processoLoop;
                            } else if (lastDialogMessage.includes('IMAGE')) {
                                console.log("Captcha incorreto, tentando novamente...");
                                captchaCorreto = false;
                            }
                        }
                    }
                    await frameBody.waitForSelector('.texto_menor')

                    let dadosTabela = await frameBody.evaluate(() => {
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
                    console.log(dadosTabela)

                    if (dadosTabela.Status === 'Aprovado') {
                        let novoDadosTabela = {};
                        for (let chave in dadosTabela) {
                            if (chave !== 'Status') {
                                novoDadosTabela[chave] = dadosTabela[chave];
                            }
                        }

                        // Adicionando a nova chave antes de 'Status'
                        novoDadosTabela['Código Segurança CRV:'] = '';

                        // Adicionando 'Status' no final
                        novoDadosTabela['Status'] = dadosTabela['Status'] !== 'Aprovado' ? 'Aprovado' : dadosTabela['Status'];

                        dadosTabela = novoDadosTabela;

                        await frameBody.evaluate(new Function('voltar()'));

                    } else {
                        console.log('ap')
                        frameBody = page.frames().find(frame => frame.name() === 'body');

                        const isvisualizarDocumentosAvailable = await frameBody.evaluate(() => {
                            return typeof visualizarDocumentos === 'function';
                        });

                        if (isvisualizarDocumentosAvailable) {
                            await Delay(5000)
                            const onclickValue = await frameBody.evaluate(() => {
                                const element = document.querySelector('#printableContent > td.texto > table:nth-child(1) > tbody > tr:nth-child(1) > td > fieldset > fieldset:nth-child(4) > table > tbody > tr > td:nth-child(3) > a');
                                return element ? element.getAttribute('onclick') : null;
                            });
                            if (onclickValue) {
                                await frameBody.evaluate(new Function(onclickValue));
                            }
                        } else {
                            console.log("A função visualizarDocumentos não está disponível.");
                            await Tab(page, 19)
                            await page.keyboard.press('Enter')
                        }

                        await Delay(10000)

                        frameBody = page.frames().find(frame => frame.name() === 'body');

                        await Delay(5000)

                        const dadosTabelaMotivo = await frameBody.evaluate(() => {
                            const tabela = document.querySelector('#historico'); // Seletor da tabela
                            if (!tabela) return []; // Se a tabela não for encontrada, retorna um array vazio

                            const linhas = Array.from(tabela.querySelectorAll('tbody tr')); // Seleciona todas as linhas da tabela
                            const dados = [];

                            linhas.forEach(linha => {
                                const colunas = linha.querySelectorAll('td');
                                const registroLinha = {
                                    data: colunas[0] ? colunas[0].innerText.trim() : '',
                                    local: colunas[1] ? colunas[1].innerText.trim() : '',
                                    status: colunas[2] ? colunas[2].innerText.trim() : '',
                                    motivoReprovacao: colunas[3] ? colunas[3].innerText.trim() : '',
                                    classificacaoReprovacao: colunas[4] ? colunas[4].innerText.trim() : '',
                                    documentos: colunas[5] ? colunas[5].innerText.trim() : ''
                                };
                                dados.push(registroLinha);
                            });

                            return dados;
                        });

                        console.log(dadosTabelaMotivo[1]);

                        dadosTabela = { ...dadosTabela, ...dadosTabelaMotivo[1] }

                        const isVoltarAvailable = await frameBody.evaluate(() => {
                            return typeof voltar === 'function';
                        });

                        if (isVoltarAvailable) {
                            await Delay(5000)
                            await frameBody.evaluate(new Function('voltar()'));
                        } else { 
                            console.log("A função 'voltar' não está disponível.");
                            await Tab(page, 4)
                            await page.keyboard.press('Enter')
                        }
                        await Delay(10000)
                    }

                    todosOsDados.push(dadosTabela);
                    await Delay(5000)
                    console.log(todosOsDados)

                }

                salvarDadosExcel(todosOsDados)


            }
        } else {
            console.log("Frame 'body' não encontrado.");
        }

        await browser.close()

    } catch (e) {
        console.log("Erro inesperado durante o processo: " + e.stack)

        try {
            salvarDadosExcel(todosOsDados)

        } catch (error) {
            console.log("Não existem dados para serem salvos.")
        }

        await page.screenshot({ path: '../Z-Erro-AP.png' })

        await browser.close()
    }
}

ProcessoECRV()