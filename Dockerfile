FROM node:11.6.0

COPY . /home/api

WORKDIR "/home/api"

RUN npm install --silent

EXPOSE 4000

CMD [ "npm", "start" ]
