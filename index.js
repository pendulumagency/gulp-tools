const gulp = require("gulp");
const del = require("del");

/**
 * Generates exports for a gulpfile based on our common business patterns
 * @param {*} options 
 */
const createGulpfile = (options) => {
    const {
        include = {}
    } = options;


    let tasks = {}; // Tasks that may be called individually

    let cleanTask = null; // Before all other build tasks
    let parallelBuildTasks = []; // One-time build of project
    let rollupTask = null; // Compilation and bundling of JavaScript

    let watchTasks = []; // Watch tasks in parallel


    /**
     * Setup clean tasks
     */
    if (include.clean) {
        const cleanParams = include.clean;
        const clean = () => del(cleanParams);

        cleanTask = clean;
        tasks.clean = clean;
        // Clean doesn't have a watch task associated with it
    }

    /**
     * Setup copy tasks
     */
    if (include.copy) {
        const copyDefsParam = include.copy;
        const result = createCopyAll(copyDefsParam);

        tasks = {...tasks, ...result.tasks};
        parallelBuildTasks = [...parallelBuildTasks, ...result.parallelBuildTasks];
        watchTasks = [...watchTasks, ...result.watchTasks];
    }

    /**
     * Setup main build and watch tasks
     */
    const buildTasks = [];
    if (cleanTask) buildTasks.push(cleanTask);
    if (parallelBuildTasks.length > 0) buildTasks.push(gulp.parallel(...parallelBuildTasks));
    if (rollupTask) buildTasks.push(rollupTask);

    const watch = watchTasks.length > 0 ? gulp.parallel(...watchTasks) : done => done(); // TODO: Don't even add watch if no watch tasks defined
    const build = gulp.series(...buildTasks);
    const buildAndWatch = gulp.series(build, /* deploy, serve, */ watch); // Not finished

    return {
        ...tasks,
        watch,
        build,
        buildAndWatch,
        default: buildAndWatch
    }
}

/**
 * Create many copy tasks named after given keys with src and dest arrays
 * @param {*} copyDefs 
 */
const createCopyAll = (copyDefs) => {
    const tasks = {};
    const parallelBuildTasks = [];
    const watchTasks = [];

    for (const key of Object.keys(copyDefs)) {
        const [src, dest] = copyDefs[key];
        const {copy, copyWatch} = createCopy(src, dest)

        tasks[key] = copy;
        tasks[key + "Watch"] = copyWatch;

        parallelBuildTasks.push(copy);

        watchTasks.push(copyWatch);
    }

    return {
        tasks,
        parallelBuildTasks,
        watchTasks
    }
}

/**
 * Generate a copy function for Gulp
 * @param {*} src 
 * @param {*} dest 
 */
const createCopy = (src, dest) => {
    const copy = () => gulp.src(src).pipe(gulp.dest(dest));
    const copyWatch = () => gulp.watch(src, copy);

    return {copy, copyWatch};
}

module.exports = {
    createGulpfile
}


console.log(createGulpfile({
    include: {
        clean: true,
        copy: {
            static: ["./src/static/**/*", "./dist"]
        }
    }
}));