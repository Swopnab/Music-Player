from tkinter import filedialog, Listbox, Menu, Frame, Button, PhotoImage, Tk
import pygame
import os
import cv2

root = Tk()
root.title('Media Player')
root.geometry("500x300")

pygame.mixer.init()

menubar = Menu(root)
root.config(menu=menubar)

media_files = []
current_file = ""
paused = False
is_video = False

def load_media():
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

def play_media():
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

def play_video(file_path):
    cap = cv2.VideoCapture(file_path)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        cv2.imshow("Video Player", frame)

        if cv2.waitKey(25) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()

def pause_media():
    global paused
    pygame.mixer.music.pause()
    paused = True

def stop_media():
    pygame.mixer.music.stop()

def next_media():
    global current_file
    try:
        index = media_files.index(current_file) + 1
        if index < len(media_files):
            songlist.selection_clear(0, "end")
            songlist.selection_set(index)
            current_file = media_files[index]
            play_media()
    except IndexError:
        pass

def prev_media():
    global current_file
    try:
        index = media_files.index(current_file) - 1
        if index >= 0:
            songlist.selection_clear(0, "end")
            songlist.selection_set(index)
            current_file = media_files[index]
            play_media()
    except IndexError:
        pass

organise_menu = Menu(menubar, tearoff=False)
organise_menu.add_command(label="Select Folder", command=load_media)
menubar.add_cascade(label="Organize", menu=organise_menu)

songlist = Listbox(root, bg="black", fg="white", width=100, height=15)
songlist.pack()

play_btn_image = PhotoImage(file="play.png")
pause_btn_image = PhotoImage(file="pause.png")
next_btn_image = PhotoImage(file="next.png")
prev_btn_image = PhotoImage(file="previous.png")

control_frame = Frame(root)
control_frame.pack()

play_btn = Button(control_frame, image=play_btn_image, borderwidth=0, command=play_media)
pause_btn = Button(control_frame, image=pause_btn_image, borderwidth=0, command=pause_media)
next_btn = Button(control_frame, image=next_btn_image, borderwidth=0, command=next_media)
prev_btn = Button(control_frame, image=prev_btn_image, borderwidth=0, command=prev_media)

prev_btn.grid(row=0, column=0, pady=10, padx=7)
play_btn.grid(row=0, column=1, pady=10, padx=7)
pause_btn.grid(row=0, column=2, pady=10, padx=7)
next_btn.grid(row=0, column=4, pady=10, padx=7)

root.mainloop()
