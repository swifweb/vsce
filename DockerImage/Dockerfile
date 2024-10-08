FROM ubuntu:focal

# fixes hang on interactive dialogs
ARG DEBIAN_FRONTEND=noninteractive

# it is very important to match it with the image platform
# e.g. for `ubuntu:focal` it should be `ubuntu20.04`
ENV S_TOOLCHAIN_PLATFORM="ubuntu20.04"
ENV SWIFWEB_IMAGE_VERSION=100

# update packages
RUN apt-get update && apt-get upgrade -y

# install required dependencies according to swift.org
RUN apt-get install -y binutils
RUN apt-get install -y git
RUN apt-get install -y gnupg2
RUN apt-get install -y libc6-dev
RUN apt-get install -y libcurl4
RUN apt-get install -y libedit2
RUN apt-get install -y libgcc-9-dev
RUN apt-get install -y libpython2.7
RUN apt-get install -y libpython3.8
RUN apt-get install -y libsqlite3-0
RUN apt-get install -y libstdc++-9-dev
RUN apt-get install -y libxml2
RUN apt-get install -y libz3-dev
RUN apt-get install -y pkg-config
RUN apt-get install -y tzdata
RUN apt-get install -y uuid-dev
RUN apt-get install -y zlib1g-dev
RUN apt-get install -y curl
# install cmd.sh related required dependencies
RUN apt-get install -y wget
RUN apt-get install -y pv
# install wasm related required dependencies
RUN apt-get install -y binaryen
RUN curl https://get.wasmer.io -sSfL | sh
# install nginx to serve the result
RUN apt-get install -y nginx
# install envsubst to put env vars into nginx config
RUN apt-get -y install gettext-base
# install node and all required packages
ENV NVM_DIR="/root/.nvm"
ENV NODE_VERSION="20.17.0"
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default \
    && npm install -g webpack-cli@^5.1.4 --quiet --no-progress
# copy required files
COPY cmd.sh /usr/local/bin/
COPY nginx/default /etc/nginx/sites-available/
COPY nginx/mime.types /etc/nginx/
COPY nginx/openssl.cnf /etc/nginx/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]