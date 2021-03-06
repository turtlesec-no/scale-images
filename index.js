const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs").promises;
const glob = require("glob");
const path = require("path");
const gm = require("gm");
const chalk = require("chalk");

try {
  const imageFolder = core.getInput("image-folder");

  // This sets the width of the thumbnails that will be create (if the image is smaller)
  const sizes = [250, 500, 1000];

  process.env.IMAGES_SCALED = 0;
  core.setOutput('scaled', process.env.IMAGES_SCALED);
  console.log("Set scaled to " + process.env.IMAGES_SCALED);

  const im = gm.subClass({ imageMagick: true });
  const images = glob.sync(path.join(process.env['GITHUB_WORKSPACE'], imageFolder, "**", "*.{jpg,jpeg,png}"));

  const thumbNameRx = new RegExp(`\\.(${sizes.map((s) => `${s}`).join("|")})\\.(jpg|jpeg|png)$`);

  images
    .filter((name) => !thumbNameRx.test(name))
    .forEach(async (imageFile) => {
      const localizedFile = imageFile.replace(process.cwd() + path.sep, "");
      const image = im(await fs.readFile(imageFile));
      image.size((err, geometry) => {
        if (err) {
          core.setFailed(chalk.red(err));
          return;
        }
        const { width } = geometry;
        if (!width) {
          core.setFailed(chalk.error(`${localizedFile} has no width!`));
          return;
        }
        sizes.forEach(async (size) => {
          const { dir, name, ext } = path.parse(imageFile);
          const thumbnailFile = `${dir}${path.sep}${name}.${size}${ext}`;
          if (width <= size) {
            console.log(chalk.grey(`[${size}] ${localizedFile} size ${width} is smaller or equal`));
            fs.copyFile(imageFile, thumbnailFile);
            return;
          }
          try {
            await fs.stat(thumbnailFile);
            console.log(chalk.cyan(`[${size}] thumbnail for ${localizedFile} exists`));

            if (process.env.IMAGES_SCALED == '0') {
              process.env.IMAGES_SCALED = 1;
              core.setOutput('scaled', process.env.IMAGES_SCALED);
              console.log("Set scaled to " + process.env.IMAGES_SCALED);
            }
            
          } catch (_) {
            image.identify((err, ident) => {
              if (err) {
                core.setFailed(chalk.red(err));
                return;
              }
              image
                .resize(size, `${size}>`)
                .gravity("Center")
                .noProfile()
                .strip()
                .toBuffer(ident.format, async (err, buffer) => {
                  if (err) {
                    core.setFailed(chalk.red(err));
                    return;
                  }
                  await fs.writeFile(thumbnailFile, buffer);
                  console.log(chalk.green(`[${size}] thumbnail for ${localizedFile} created`));
                  process.env.IMAGES_SCALED = 2;
                  core.setOutput('scaled', process.env.IMAGES_SCALED);
                  console.log("Set scaled to " + process.env.IMAGES_SCALED);
                });
            });
          }
        });
      });
    });
} catch (error) {
  core.setFailed(error.message);
}
