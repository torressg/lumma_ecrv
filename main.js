const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const XLSX = require('xlsx');
require('dotenv').config({ path: './constants/.env' });

const Tab = require('./modules/Pup_modules/tab');
const Delay = require('./modules/Pup_modules/delay');
const DeathCaptcha = require('./modules/DeathByCaptcha/death');
const path = require('path');

function lerPrimeiraColunaDoExcel(caminhoArquivo) {
    const workbook = XLSX.readFile(caminhoArquivo);
    const sheetName = workbook.SheetNames[0]; // Assume que os dados estão na primeira aba
    const sheet = workbook.Sheets[sheetName];

    const dados = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Converte a aba em um array de arrays
    return dados.map(row => row[0]); // Retorna apenas a primeira coluna de cada linha
}
let dialogAction = 'dismiss'; // Opções: 'dismiss' ou 'accept'
let lastDialogMessage = '';

async function realizarLoginEVerificacoes(page, frameBody, CPF, SENHA) {

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

async function runAutomation() {

    const CPF = process.env.CPF
    const SENHA = process.env.SENHA
    const linkECRV = 'https://www.e-crvsp.sp.gov.br/'

    const dadosDaPrimeiraColuna = lerPrimeiraColunaDoExcel('./ECRV.xlsx');

    const browser = await puppeteer.launch({
        headless: false,
        protocolTimeout: 90000
    });

    const page = await browser.newPage();

    const cookiesString = await fs.readFile("./cookies.json");
    const cookies = JSON.parse(cookiesString);
    await page.setCookie(...cookies);

    await page.goto(linkECRV, { waitUntil: 'networkidle2' })

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

        // Toda a parte de login no e-CRV
        await realizarLoginEVerificacoes(page, frameBody, CPF, SENHA);

        // Condioções para sessão aberta
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
                    // Se houver uma sessão aberta, clique no botão para encerrar sessões anteriores
                    await Tab(page, 13)
                    await page.keyboard.press('Enter')
                    await Delay(5000)
                    let frameBody = page.frames().find(frame => frame.name() === 'body');
                    await realizarLoginEVerificacoes(page, frameBody, CPF, SENHA);
                    await Tab(page, 13)
                    await page.keyboard.press('Enter')
                } else {
                    await Tab(page, 13)
                    await page.keyboard.press('Enter')
                }
            } else {
                console.log("Iframe interno 'GB_frame' não encontrado.");
            }
        } else {
            console.log("Iframe externo 'GB_frame' não encontrado.");
        }

        await Delay(5000)

        // Clica ao botão "Autenticar"

        frameBody = page.frames().find(frame => frame.name() === 'body');
        // await Delay(10000)
        await frameBody.waitForFunction(
            text => document.body.innerText.includes(text),
            {},
            'Bem-vindo(a) ao e-CRVsp!'
        );
        await frameBody.evaluate(() => {
            Array.from(document.querySelectorAll('.list-group-item a.dropdown-toggle')).find(el => el.textContent.includes('Processos')).click();
        });
        await Delay(1000)
        await frameBody.waitForFunction(
            text => document.body.innerText.includes(text),
            {},
            'Consultar Ficha Cadastral'
        );

        await frameBody.evaluate(() => {
            Array.from(document.querySelectorAll('.list-group-item-sub.dropdown a')).find(el => el.textContent.includes('Consultar Ficha Cadastral')).click();
        });
        await frameBody.waitForSelector('.campos_upper')

        dialogAction = 'accept';

        let todosOsDados = [];

        placaLoop: for (i = 1; i < dadosDaPrimeiraColuna.length; i++) {
            let placa = dadosDaPrimeiraColuna[i]
            let captchaCorreto = false;

            await frameBody.waitForSelector('.campos_upper')

            while (!captchaCorreto) {
                await frameBody.evaluate(() => {
                    document.querySelector('.campos_upper').value = '';
                });
                // Insere a placa e tira um screenshot do captcha
                await frameBody.type('.campos_upper', placa);
                await page.screenshot({ path: './imageCaptcha/captcha.png', clip: { x: 230, y: 361, width: 225, height: 73 } });

                // Resolve o captcha e insere a resposta
                let captcha = await DeathCaptcha('./imageCaptcha/captcha.png');
                await frameBody.type('#captchaResponse', captcha);

                // Clica no botão de pesquisa
                await frameBody.evaluate(() => {
                    document.querySelector('.bt_pesquisar').click();
                });

                try {
                    // Espera pelo texto indicativo de sucesso, ajuste o tempo de espera conforme necessário
                    await frameBody.waitForFunction(
                        text => document.body.innerText.includes(text),
                        { timeout: 5000 }, // Tempo de espera antes de considerar falha no captcha
                        'DADOS DA FICHA CADASTRAL'
                    );
                    captchaCorreto = true;
                    console.log(`Dados da placa ${placa} retirados.`)// Se o texto for encontrado, captcha está correto
                } catch (error) {
                    // Se o texto não for encontrado, o loop tentará novamente
                    if (lastDialogMessage.includes('PLACA')) {
                        console.log(`A placa ${placa} é inválida.`)
                        todosOsDados.push({ "PLACA": placa })
                        captchaCorreto = false;
                        continue placaLoop;
                    } else if (lastDialogMessage.includes('IMAGE')) {
                        console.log("Captcha incorreto, tentando novamente...");

                    }
                    captchaCorreto = false;
                }
            }



            await frameBody.waitForSelector('.texto_menor')

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
                                }
                            }
                        });
                    });
                });

                return dados;
            });

            todosOsDados.push({ 'placa': placa, 'status': 'Inválido', ...dadosTabela });


            // console.log(dadosTabela)
            // const dadosArray = prepararDadosParaExcel(dadosTabela);
            // adicionarDadosAoExcel('./ECRVteste.xlsx', dadosArray, i + 2);

            await Delay(5000)
            await frameBody.evaluate(() => {
                document.querySelector('#tabBotoes > tbody > tr > td > a.bt_voltar').click();
            });
        }
        const headers = ['Placa', 'Status', 'N da Ficha', 'Ano Ficha', 'Renavam', 'Chassi', 'Placa', 'Município', 'Despachante', 'Status Registro', 'Retorno Consistência', 'Opcão'];

        const worksheet = XLSX.utils.aoa_to_sheet([headers]);

    // Adicionar os dados
    todosOsDados.forEach(dado => {
        const row = headers.map(header => dado[header] || '');
        XLSX.utils.sheet_add_aoa(worksheet, [row], { origin: -1 });
    });

    // Criar o livro e adicionar a planilha
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");

    // Salvar a planilha
    XLSX.writeFile(workbook, 'dadosTabela.xlsx');

    } else {
        console.log("Frame 'body' não encontrado.");
    }

    await browser.close()

}


runAutomation()