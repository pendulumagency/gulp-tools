const del = require("del")

const delDir = (...dirs) => {
    return done => {
        Promise.all(dirs)
            .then(done);
    }
}

exports.default = {
    delDir
}