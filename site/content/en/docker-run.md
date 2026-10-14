---
description: Run Gresbase with plain docker run instead of Compose, then update it or stop it.
---

## Start the container {#start}

This command does the same as the [quick start](./quick-start.md) Compose file:

```sh
docker run -d --name gresbase \
  -e DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME \
  -e GRESBASE_READ_ONLY=false \
  -p 127.0.0.1:{{port}}:8080 \
  -v gresbase-data:/data \
  --restart unless-stopped \
  {{image}}
```

| Option | Why |
| --- | --- |
| `-e DATABASE_URL=…` | The database to manage. Leave it out to open the [setup wizard](./setup-wizard.md). |
| `-p 127.0.0.1:{{port}}:8080` | Publishes the container's port 8080 on your machine only. |
| `-v gresbase-data:/data` | Keeps settings, saved connections and saved queries across updates. |
| `--restart unless-stopped` | Starts it again after a crash or a reboot, unless you stopped it. |

Then open [http://localhost:{{port}}](http://localhost:{{port}}).

:::warning
Without `-v`, Docker gives `/data` an anonymous volume tied to this container. The next container, after an update for example, starts with an empty one: settings and saved queries seem gone. Gresbase warns about it in the log and in the app.
:::

## Reach a database in another container {#same-network}

If PostgreSQL runs in a container, put both on the same Docker network and use the container name as the host:

```sh
docker network create gresbase-net
docker network connect gresbase-net my-postgres
docker run -d --name gresbase --network gresbase-net \
  -e DATABASE_URL=postgres://USER:PASSWORD@my-postgres:5432/DBNAME?sslmode=disable \
  -p 127.0.0.1:{{port}}:8080 \
  -v gresbase-data:/data \
  --restart unless-stopped \
  {{image}}
```

Replace `my-postgres` with the name of your database container.

## Check it {#check}

```sh
docker logs -f gresbase
docker ps --filter name=gresbase
```

The log shows `starting gresbase` once it's connected. `docker ps` shows `healthy` when the built-in health check passes.

To see the version:

```sh
docker exec gresbase /gresbase version
```

## Update {#update}

Your settings live in the `gresbase-data` volume, so you can replace the container freely.

:::steps
### Pull the new image {#pull}

```sh
docker pull {{image}}
```

### Remove the old container {#remove}

```sh
docker stop gresbase
docker rm gresbase
```

### Start it again {#start-again}

Run the same `docker run` command as before, with the same volume.
:::

Read [Upgrading](./upgrading.md) before jumping between versions.

## Stop and remove {#stop}

```sh
docker stop gresbase     # stop it; docker start gresbase brings it back
docker rm gresbase       # remove the container, keep the volume
docker volume rm gresbase-data   # also delete settings and saved queries
```

:::warning
`docker volume rm gresbase-data` deletes Gresbase's settings, saved connections, the administrator account and your saved queries. Your PostgreSQL data isn't touched.
:::
