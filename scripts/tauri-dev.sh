#!/bin/bash
# Script to run tauri dev with clean environment (avoiding snap conflicts)

# Preserve essential variables
CLEAN_ENV="HOME=$HOME"
CLEAN_ENV="$CLEAN_ENV USER=$USER"
CLEAN_ENV="$CLEAN_ENV DISPLAY=$DISPLAY"
CLEAN_ENV="$CLEAN_ENV WAYLAND_DISPLAY=$WAYLAND_DISPLAY"
CLEAN_ENV="$CLEAN_ENV XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR"
CLEAN_ENV="$CLEAN_ENV PATH=/home/$USER/.cargo/bin:/home/$USER/.local/bin:/usr/local/bin:/usr/bin:/bin:/snap/bin"
CLEAN_ENV="$CLEAN_ENV TERM=$TERM"
CLEAN_ENV="$CLEAN_ENV SHELL=$SHELL"

# Add Node.js path if it exists
if [ -d "$HOME/.nvm" ]; then
    CLEAN_ENV="$CLEAN_ENV NVM_DIR=$HOME/.nvm"
fi

# Execute tauri dev with clean environment
env -i $CLEAN_ENV bash -c "cd $(pwd) && npx tauri dev"
