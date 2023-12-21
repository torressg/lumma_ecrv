const AndamentoProcesso = require('./automations/AndamentoProcesso')
const ConsultaFicha = require('./automations/ConsultaFicha')

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

(async () => {
    await ConsultaFicha()
    await delay(5000)
	await AndamentoProcesso()
})()