/**
 * Application starts here.
 */
const debug      = require("debug")("api:server"),
      cors       = require("cors"),
      express    = require("express"),
      bodyParser = require("body-parser");

require('express-async-errors');

const number = new RegExp(/^\d+$/);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static('uploads'));

global.__basedir = __dirname;

app.use("/", require("./routes"));
app.use("/video", require("./routes/video"));

app.use((err, req, res, next) => {
    res.status(err.status || 500);
    res.json(err);
    next(err);
});

module.exports = app;
