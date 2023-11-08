/**
 */
const _       = require('lodash'),
      express = require('express');

const pkg  = require("../../package");

const router = express.Router();

/**
 * Version
 */
router.get('/', function(req, res) {

    setTimeout(()=> {
        console.log('FROM TIMEOUT TEST');
    }, 3000);
    return res.status(201).send({version: pkg.version}).end();
});

module.exports = router;