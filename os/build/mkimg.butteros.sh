# Alpine mkimage profile: ButterOS. Boots into RAM (Alpine "diskless" mode) with Docker, Node and the ButterHosting API.
profile_butteros() {
	profile_standard
	profile_abbrev="butteros"
	title="ButterOS"
	desc="Tiny server-hosting OS that runs from RAM"
	arch="x86_64"
	output_format="iso"
	image_ext="iso"
	apks="$apks $(cat "${BUTTER_APKS_FILE:-/dev/null}" 2>/dev/null)"
	apkovl="genapkovl-butteros.sh"
	initfs_features="ata base cdrom ext4 keymap kms mmc nvme raid scsi squashfs usb virtio butterhost"
}
