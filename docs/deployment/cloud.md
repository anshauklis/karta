# Cloud Deployment

## AWS EC2

1. Launch an EC2 instance:
   - **AMI:** Ubuntu 22.04 LTS
   - **Instance type:** t3.small (2 vCPU, 2 GB) or larger
   - **Storage:** 20 GB gp3
   - **Security group:** Allow inbound 80, 443, 22

2. SSH into the instance:

   ```bash
   ssh -i your-key.pem ubuntu@<instance-ip>
   ```

3. Install Docker:

   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   # Log out and back in
   ```

4. Deploy:

   ```bash
   git clone https://github.com/anshauklis/karta.git
   cd karta
   DOMAIN=charts.example.com ./install.sh --ssl
   ```

## DigitalOcean

1. Create a Droplet:
   - **Image:** Ubuntu 22.04
   - **Plan:** Basic, 2 GB RAM ($12/mo)
   - **Region:** closest to your users

2. SSH in and follow steps 3-4 from the AWS section above.

## Hetzner

1. Create a Cloud Server:
   - **Image:** Ubuntu 22.04
   - **Type:** CX22 (2 vCPU, 4 GB) or CX11 (2 vCPU, 2 GB)
   - **Location:** closest to your users

2. SSH in and follow steps 3-4 from the AWS section above.

## Post-Deployment Checklist

After deploying to any cloud provider:

1. **DNS** — point your domain to the server IP (A record)
2. **Admin account** — register the first user
3. **Backups** — set up the daily cron job (see {doc}`operations`)
4. **Monitoring** — set up uptime monitoring pointing at `https://your-domain.com/api/health`
5. **Firewall** — restrict ports to 80, 443, and SSH (see {doc}`security`)
