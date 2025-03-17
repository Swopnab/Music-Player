from tkinter import filedialog, Listbox, Menu, Frame, Button, PhotoImage, Tk, Scale
import pygame
import os
import cv2

root = Tk()
root.title('Media Player')
root.geometry("700x500")

pygame.mixer.init()

menubar = Menu(root)
root.config(menu=menubar)

media_files = []
current_file = ""
paused = False
is_video = False


def load_music():
    global current_file
    root.directory = filedialog.askdirectory()

    media_files.clear()
    for file in os.listdir(root.directory):
        name, ext = os.path.splitext(file)
        if ext.lower() in ['.mp3', '.mp4']:
            media_files.append(file)

    songlist.delete(0, "end")
    for file in media_files:
        songlist.insert("end", file)

    if media_files:
        songlist.selection_set(0)
        current_file = media_files[songlist.curselection()[0]]

def play_music():
    global current_file, paused, is_video

    if not media_files:
        return

    current_file = media_files[songlist.curselection()[0]]
    file_path = os.path.join(root.directory, current_file)

    _, ext = os.path.splitext(current_file)
    is_video = ext.lower() == ".mp4"

    if is_video:
        play_video(file_path)
    else:
        if not paused:
            pygame.mixer.music.load(file_path)
            pygame.mixer.music.play()
        else:
            pygame.mixer.music.unpause()
            paused = False

def pause_music():
    global paused
    if paused:
        pygame.mixer.music.unpause() 
        paused = False
    else:
        pygame.mixer.music.pause() 
        paused = True

def stop_music():
    pygame.mixer.music.stop()

def next_music():
    global current_file
    try:
        index = media_files.index(current_file) + 1
        if index < len(media_files):
            songlist.selection_clear(0, "end")
            songlist.selection_set(index)
            current_file = media_files[index]
            play_music()
    except IndexError:
        pass

def prev_music():
    global current_file
    try:
        index = media_files.index(current_file) - 1
        if index >= 0:
            songlist.selection_clear(0, "end")
            songlist.selection_set(index)
            current_file = media_files[index]
            play_music()
    except IndexError:
        pass

def update_volume(val):
    pygame.mixer.music.set_volume(float(val))

volume_slider = Scale(root, from_=0, to=100, resolution=1, orient="vertical", label="Volume")
volume_slider.set(1) 
volume_slider.bind("<Motion>", lambda event: update_volume(volume_slider.get()))


organise_menu = Menu(menubar, tearoff=False)
organise_menu.add_command(label="Select Folder", command=load_music)
menubar.add_cascade(label="Find", menu=organise_menu)

songlist = Listbox(root, bg="black", fg="white")
songlist.grid(row=0, column=0, columnspan=4, sticky="nsew")

root.grid_rowconfigure(0, weight=1)
root.grid_columnconfigure(0, weight=1)
root.grid_columnconfigure(1, weight=0)
root.grid_columnconfigure(2, weight=0)
root.grid_columnconfigure(3, weight=0)

control_frame = Frame(root)
control_frame.grid(row=1, column=0, columnspan=4, pady=10)

play_btn_image = PhotoImage(file="play.png")
pause_btn_image = PhotoImage(file="pause.png")
next_btn_image = PhotoImage(file="next.png")
prev_btn_image = PhotoImage(file="previous.png")

play_btn = Button(control_frame, image=play_btn_image, borderwidth=0, command=play_music)
pause_btn = Button(control_frame, image=pause_btn_image, borderwidth=0, command=pause_music)
next_btn = Button(control_frame, image=next_btn_image, borderwidth=0, command=next_music)
prev_btn = Button(control_frame, image=prev_btn_image, borderwidth=0, command=prev_music)

prev_btn.grid(row=0, column=0, pady=10, padx=7)
play_btn.grid(row=0, column=1, pady=10, padx=7)
pause_btn.grid(row=0, column=2, pady=10, padx=7)
next_btn.grid(row=0, column=3, pady=10, padx=7)
volume_slider.grid(row=1, column=3, pady=10, padx=7)


root.mainloop()
